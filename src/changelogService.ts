import {Shortcuts} from '@basmilius/homey-common';
import type {
    AppPreferences,
    AppVersionInfo,
    ChangelogApiResponse,
    ChangelogEntryView,
    ChangelogFull,
    ChangelogPreview,
    ChangelogsApp,
    InstalledApp,
    InstalledAppView
} from './types';
import {Triggers} from './flow';

const APPS_API_URL = 'https://apps-api.athom.com/api/v1/app';
const CHANGELOG_CACHE_TTL_MS = 600_000;
const VERSION_CACHE_TTL_MS = 600_000;
const POLL_INTERVAL_MS = 300_000;
const SETTINGS_KEY_KNOWN_VERSIONS = 'knownAppVersions';
const SETTINGS_KEY_NOTIFIED_VERSIONS = 'notifiedAvailableVersions';
const SETTINGS_KEY_NOTIFY = 'notifyOnUpdateAvailable';
const SETTINGS_KEY_INCLUDE_TEST = 'includeTestBuilds';

const DEFAULT_NOTIFY_ON_UPDATE = true;
const DEFAULT_INCLUDE_TEST_BUILDS = false;

type CachedChangelog = {
    readonly response: ChangelogApiResponse | null;
    readonly fetchedAt: number;
};

type CachedVersion = {
    readonly info: AppVersionInfo | null;
    readonly fetchedAt: number;
};

type AppMetaResponse = {
    readonly liveBuild?: {
        readonly version?: string | null;
    } | null;
    readonly testBuild?: {
        readonly version?: string | null;
    } | null;
};

type RawInstalledApp = InstalledApp & {
    readonly iconObj: unknown;
    readonly color: unknown;
    readonly brandColor: unknown;
};

/**
 * Service that monitors installed Homey apps for updates and fires triggers
 * with changelog information when an app has been updated, and that detects
 * when a newer version is available on the Athom store.
 */
export default class ChangelogService extends Shortcuts<ChangelogsApp> {
    #knownVersions: Map<string, string> = new Map();
    #notifiedAvailableVersions: Map<string, string> = new Map();
    #pollInterval: NodeJS.Timeout | null = null;
    #changelogCache: Map<string, CachedChangelog> = new Map();
    #versionCache: Map<string, CachedVersion> = new Map();

    /**
     * Starts the service by capturing the current app versions and beginning the poll interval.
     */
    async initialize(): Promise<void> {
        const apps = await this.#getInstalledApps();

        this.log(`Found ${apps.length} installed apps:`);
        for (const app of apps) {
            this.log(`  - ${app.name} (${app.id}) v${app.version}`);
        }

        const stored = this.settings.get(SETTINGS_KEY_KNOWN_VERSIONS) as Record<string, string> | null;

        if (stored) {
            for (const [appId, version] of Object.entries(stored)) {
                this.#knownVersions.set(appId, version);
            }
        } else {
            for (const app of apps) {
                this.#knownVersions.set(app.id, app.version);
            }

            this.#persistVersions();
            this.log(`Captured versions of ${apps.length} installed apps.`);
        }

        const storedNotified = this.settings.get(SETTINGS_KEY_NOTIFIED_VERSIONS) as Record<string, string> | null;

        if (storedNotified) {
            for (const [appId, version] of Object.entries(storedNotified)) {
                this.#notifiedAvailableVersions.set(appId, version);
            }
        }

        this.#pollInterval = this.setInterval(() => this.#poll(), POLL_INTERVAL_MS);
        this.log('Changelog service started, polling every 5 minutes.');
    }

    /**
     * Stops the polling interval.
     */
    async destroy(): Promise<void> {
        if (this.#pollInterval !== null) {
            this.clearInterval(this.#pollInterval);
            this.#pollInterval = null;
        }
    }

    /**
     * Returns all installed apps enriched with icon, brand color, the latest
     * changelog entry, and the latest available version on the Athom store.
     * Used by the settings overview.
     */
    async getInstalledAppsWithChangelog(): Promise<InstalledAppView[]> {
        const apps = await this.#getRawInstalledApps();
        const includeTest = this.getIncludeTestBuilds();

        const enriched = await Promise.all(apps.map(async (app) => {
            const [latestChangelog, versionInfo] = await Promise.all([
                this.fetchLatestChangelog(app.id, app.version),
                this.fetchAvailableVersion(app.id)
            ]);

            const liveVersion = versionInfo?.liveVersion ?? null;
            const testVersion = versionInfo?.testVersion ?? null;
            const storeUrl = versionInfo?.storeUrl ?? this.#buildStoreUrl(app.id);

            const hasUpdate = liveVersion !== null && this.#compareVersions(liveVersion, app.version) > 0;
            const hasTestUpdate = includeTest
                && testVersion !== null
                && this.#compareVersions(testVersion, app.version) > 0
                && (liveVersion === null || this.#compareVersions(testVersion, liveVersion) > 0);

            return {
                id: app.id,
                name: app.name,
                version: app.version,
                iconUrl: this.#extractIconUrl(app.iconObj, app.id),
                color: this.#normalizeColor(app.color),
                brandColor: this.#normalizeColor(app.brandColor),
                latestChangelog,
                latestVersion: liveVersion,
                latestTestVersion: testVersion,
                hasUpdate,
                hasTestUpdate,
                storeUrl
            } satisfies InstalledAppView;
        }));

        enriched.sort((left, right) => left.name.localeCompare(right.name));

        return enriched;
    }

    /**
     * Returns the full changelog for a specific app, sorted newest first.
     *
     * @param appId The app ID.
     */
    async getFullChangelog(appId: string): Promise<ChangelogFull> {
        const response = await this.fetchAllChangelogs(appId);

        if (response === null) {
            return [];
        }

        const entries: ChangelogEntryView[] = [];

        for (const [version, entry] of Object.entries(response)) {
            const text = this.#pickChangelogText(entry.changelog);

            entries.push({
                version,
                text,
                date: this.#formatDate(entry.createdAt),
                rawDate: entry.createdAt
            });
        }

        entries.sort((left, right) => {
            const leftDate = Date.parse(left.rawDate);
            const rightDate = Date.parse(right.rawDate);

            if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
                return right.version.localeCompare(left.version);
            }

            return rightDate - leftDate;
        });

        return entries;
    }

    /**
     * Fetches the full changelog response for an app from the Athom API,
     * using an in-memory cache with a 10 minute TTL.
     *
     * @param appId The app ID.
     */
    async fetchAllChangelogs(appId: string): Promise<ChangelogApiResponse | null> {
        const cached = this.#changelogCache.get(appId);

        if (cached && Date.now() - cached.fetchedAt < CHANGELOG_CACHE_TTL_MS) {
            return cached.response;
        }

        try {
            const url = `${APPS_API_URL}/${appId}/changelog`;
            const response = await fetch(url);

            if (!response.ok) {
                this.log(`Changelog API responded with status ${response.status} for ${appId}.`);
                this.#changelogCache.set(appId, {response: null, fetchedAt: Date.now()});
                return null;
            }

            const changelog = await response.json() as ChangelogApiResponse;

            this.#changelogCache.set(appId, {response: changelog, fetchedAt: Date.now()});

            return changelog;
        } catch (err) {
            this.log(`Failed to fetch changelog for ${appId}:`, err);
            this.#changelogCache.set(appId, {response: null, fetchedAt: Date.now()});
            return null;
        }
    }

    /**
     * Fetches the changelog entry for the given app version. When the exact
     * version is not present in the Athom response (for example a test build
     * or an unreleased version), falls back to the most recent entry and
     * marks the result with `isFallback: true`.
     *
     * @param appId The app ID.
     * @param version The version to resolve.
     */
    async fetchLatestChangelog(appId: string, version: string): Promise<ChangelogPreview | null> {
        const response = await this.fetchAllChangelogs(appId);

        if (response === null) {
            return null;
        }

        const entry = response[version];

        if (entry) {
            return {
                version,
                text: this.#pickChangelogText(entry.changelog),
                date: this.#formatDate(entry.createdAt),
                rawDate: entry.createdAt,
                isFallback: false
            };
        }

        const fallback = this.#pickMostRecentEntry(response);

        if (fallback === null) {
            return null;
        }

        return {
            version: fallback.version,
            text: this.#pickChangelogText(fallback.entry.changelog),
            date: this.#formatDate(fallback.entry.createdAt),
            rawDate: fallback.entry.createdAt,
            isFallback: true
        };
    }

    /**
     * Fetches the live and test build versions for an app from the Athom
     * store API, using an in-memory cache with a 10 minute TTL.
     *
     * @param appId The app ID.
     */
    async fetchAvailableVersion(appId: string): Promise<AppVersionInfo | null> {
        const cached = this.#versionCache.get(appId);

        if (cached && Date.now() - cached.fetchedAt < VERSION_CACHE_TTL_MS) {
            return cached.info;
        }

        try {
            const url = `${APPS_API_URL}/${appId}`;
            const response = await fetch(url);

            if (!response.ok) {
                this.log(`Apps API responded with status ${response.status} for ${appId}.`);
                this.#versionCache.set(appId, {info: null, fetchedAt: Date.now()});
                return null;
            }

            const meta = await response.json() as AppMetaResponse;
            const info: AppVersionInfo = {
                liveVersion: this.#normalizeVersion(meta.liveBuild?.version),
                testVersion: this.#normalizeVersion(meta.testBuild?.version),
                storeUrl: this.#buildStoreUrl(appId)
            };

            this.#versionCache.set(appId, {info, fetchedAt: Date.now()});

            return info;
        } catch (err) {
            this.log(`Failed to fetch version info for ${appId}:`, err);
            this.#versionCache.set(appId, {info: null, fetchedAt: Date.now()});
            return null;
        }
    }

    /**
     * Returns the user preference for sending a timeline notification when
     * an update is available. Defaults to true.
     */
    getNotifyOnUpdateAvailable(): boolean {
        const value = this.settings.get(SETTINGS_KEY_NOTIFY);

        if (typeof value !== 'boolean') {
            return DEFAULT_NOTIFY_ON_UPDATE;
        }

        return value;
    }

    /**
     * Returns the user preference for including test builds when checking
     * for available updates. Defaults to false.
     */
    getIncludeTestBuilds(): boolean {
        const value = this.settings.get(SETTINGS_KEY_INCLUDE_TEST);

        if (typeof value !== 'boolean') {
            return DEFAULT_INCLUDE_TEST_BUILDS;
        }

        return value;
    }

    /**
     * Returns the current user preferences for the Changelogs app.
     */
    getPreferences(): AppPreferences {
        return {
            notifyOnUpdateAvailable: this.getNotifyOnUpdateAvailable(),
            includeTestBuilds: this.getIncludeTestBuilds()
        };
    }

    /**
     * Persists user preferences for the Changelogs app. Any caches that
     * depend on a preference are cleared so the next fetch reflects the
     * new state.
     *
     * @param preferences The new preferences.
     */
    setPreferences(preferences: Partial<AppPreferences>): AppPreferences {
        if (typeof preferences.notifyOnUpdateAvailable === 'boolean') {
            this.settings.set(SETTINGS_KEY_NOTIFY, preferences.notifyOnUpdateAvailable);
        }

        if (typeof preferences.includeTestBuilds === 'boolean') {
            this.settings.set(SETTINGS_KEY_INCLUDE_TEST, preferences.includeTestBuilds);
        }

        return this.getPreferences();
    }

    /**
     * Polls the installed apps for version changes and for newly available
     * versions on the Athom store. Fires triggers and notifications where
     * appropriate.
     */
    async #poll(): Promise<void> {
        try {
            const apps = await this.#getInstalledApps();
            const updatedApps: { app: InstalledApp; previousVersion: string }[] = [];

            for (const app of apps) {
                const knownVersion = this.#knownVersions.get(app.id);

                if (knownVersion && knownVersion !== app.version) {
                    updatedApps.push({app, previousVersion: knownVersion});
                }

                this.#knownVersions.set(app.id, app.version);
            }

            // Remove apps that are no longer installed.
            const currentIds = new Set(apps.map((app) => app.id));

            for (const appId of this.#knownVersions.keys()) {
                if (!currentIds.has(appId)) {
                    this.#knownVersions.delete(appId);
                }
            }

            for (const appId of this.#notifiedAvailableVersions.keys()) {
                if (!currentIds.has(appId)) {
                    this.#notifiedAvailableVersions.delete(appId);
                }
            }

            this.#persistVersions();

            for (const {app, previousVersion} of updatedApps) {
                await this.#handleAppUpdated(app, previousVersion);
            }

            for (const app of apps) {
                await this.#checkForAvailableUpdate(app);
            }

            this.#persistNotifiedVersions();
        } catch (err) {
            this.log('Failed to poll for app updates:', err);
        }
    }

    /**
     * Handles a detected app update by fetching the changelog and firing the trigger.
     *
     * @param app The updated app.
     * @param previousVersion The previous version of the app.
     */
    async #handleAppUpdated(app: InstalledApp, previousVersion: string): Promise<void> {
        this.log(`App updated: ${app.name} (${app.id}) to version ${app.version}`);

        // The update likely invalidates any cached data for this app.
        this.#changelogCache.delete(app.id);
        this.#versionCache.delete(app.id);
        this.#notifiedAvailableVersions.delete(app.id);

        const changelog = await this.fetchLatestChangelog(app.id, app.version);

        await this.registry.fireTrigger(Triggers.AppUpdated, {}, {
            app_name: app.name,
            app_id: app.id,
            version: app.version,
            previous_version: previousVersion,
            changelog: changelog?.text ?? '(changelog not available)',
            date: changelog?.date ?? ''
        });
    }

    /**
     * Checks whether a newer version of the given app is available on the
     * Athom store. Fires the `update_available` trigger and (optionally)
     * sends a timeline notification when a new version is detected.
     *
     * @param app The installed app.
     */
    async #checkForAvailableUpdate(app: InstalledApp): Promise<void> {
        const info = await this.fetchAvailableVersion(app.id);

        if (info === null || info.liveVersion === null) {
            return;
        }

        if (this.#compareVersions(info.liveVersion, app.version) <= 0) {
            return;
        }

        const alreadyNotified = this.#notifiedAvailableVersions.get(app.id);

        if (alreadyNotified === info.liveVersion) {
            return;
        }

        this.log(`Update available for ${app.name} (${app.id}): ${app.version} -> ${info.liveVersion}`);

        const changelogResponse = await this.fetchAllChangelogs(app.id);
        const newEntry = changelogResponse?.[info.liveVersion] ?? null;
        const changelogText = newEntry ? this.#pickChangelogText(newEntry.changelog) : '';
        const date = newEntry ? this.#formatDate(newEntry.createdAt) : '';

        await this.registry.fireTrigger(Triggers.UpdateAvailable, {}, {
            app_name: app.name,
            app_id: app.id,
            current_version: app.version,
            latest_version: info.liveVersion,
            changelog: changelogText.length > 0 ? changelogText : '(changelog not available)',
            date
        });

        if (this.getNotifyOnUpdateAvailable()) {
            await this.notify(`**${app.name}** v${info.liveVersion} is available.`);
        }

        this.#notifiedAvailableVersions.set(app.id, info.liveVersion);
    }

    /**
     * Returns all currently installed Homey apps via the Homey Web API,
     * mapped to the basic InstalledApp shape used by the polling loop.
     */
    async #getInstalledApps(): Promise<InstalledApp[]> {
        const apps = await this.#getRawInstalledApps();

        return apps.map((app) => ({
            id: app.id,
            name: app.name,
            version: app.version
        }));
    }

    /**
     * Returns all currently installed Homey apps with their raw icon and
     * brand color metadata preserved.
     */
    async #getRawInstalledApps(): Promise<RawInstalledApp[]> {
        const apps = await this.app.api.apps.getApps();

        return Object.values(apps).map((app) => {
            const raw = app as unknown as {
                iconObj?: unknown;
                color?: unknown;
                brandColor?: unknown;
            };

            return {
                id: app.id,
                name: app.name,
                version: app.version,
                iconObj: raw.iconObj ?? null,
                color: raw.color ?? null,
                brandColor: raw.brandColor ?? null
            };
        });
    }

    /**
     * Normalizes an unknown color value to a trimmed string or null.
     *
     * @param value The raw value from the Homey API.
     */
    #normalizeColor(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();

        return trimmed.length > 0 ? trimmed : null;
    }

    /**
     * Normalizes an unknown version value to a trimmed string or null.
     *
     * @param value The raw value from the Apps API.
     */
    #normalizeVersion(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();

        return trimmed.length > 0 ? trimmed : null;
    }

    /**
     * Builds the Homey App Store URL for the given app ID.
     *
     * @param appId The app ID.
     */
    #buildStoreUrl(appId: string): string {
        return `https://homey.app/a/${appId}/`;
    }

    /**
     * Extracts the best available icon URL from the Homey API icon object.
     * Falls back to the Homey manager icon route when only an id is present.
     *
     * @param iconObj The raw icon object from the Homey API.
     * @param appId The app ID, used to construct a fallback URL.
     */
    #extractIconUrl(iconObj: unknown, appId: string): string | null {
        if (iconObj === null || typeof iconObj !== 'object') {
            return `/api/manager/apps/app/${appId}/icon`;
        }

        const candidate = iconObj as {url?: unknown; id?: unknown};

        if (typeof candidate.url === 'string' && candidate.url.length > 0) {
            return candidate.url;
        }

        return `/api/manager/apps/app/${appId}/icon`;
    }

    /**
     * Picks the most suitable changelog text from the per-locale map,
     * preferring English and falling back to Dutch or the first value.
     *
     * @param changelog The per-locale changelog map.
     */
    #pickChangelogText(changelog: {readonly [locale: string]: string}): string {
        if (typeof changelog.en === 'string' && changelog.en.length > 0) {
            return changelog.en;
        }

        if (typeof changelog.nl === 'string' && changelog.nl.length > 0) {
            return changelog.nl;
        }

        for (const value of Object.values(changelog)) {
            if (typeof value === 'string' && value.length > 0) {
                return value;
            }
        }

        return '';
    }

    /**
     * Returns the most recent entry from a changelog response based on
     * `createdAt`, or null when the response is empty.
     *
     * @param response The full changelog response.
     */
    #pickMostRecentEntry(response: ChangelogApiResponse): {version: string; entry: ChangelogApiResponse[string]} | null {
        let bestVersion: string | null = null;
        let bestEntry: ChangelogApiResponse[string] | null = null;
        let bestTime = -Infinity;

        for (const [version, entry] of Object.entries(response)) {
            const time = Date.parse(entry.createdAt);
            const safeTime = Number.isNaN(time) ? 0 : time;

            if (safeTime > bestTime) {
                bestTime = safeTime;
                bestVersion = version;
                bestEntry = entry;
            }
        }

        if (bestVersion === null || bestEntry === null) {
            return null;
        }

        return {version: bestVersion, entry: bestEntry};
    }

    /**
     * Compares two semver-like version strings (X.Y.Z). Returns a positive
     * number when `a` is greater than `b`, a negative number when smaller,
     * and zero when equal. Non-numeric segments fall back to a string
     * comparison.
     *
     * @param a The left version.
     * @param b The right version.
     */
    #compareVersions(a: string, b: string): number {
        const left = a.split('.');
        const right = b.split('.');
        const length = Math.max(left.length, right.length);

        for (let index = 0; index < length; index++) {
            const leftSegment = left[index] ?? '0';
            const rightSegment = right[index] ?? '0';
            const leftNumber = Number.parseInt(leftSegment, 10);
            const rightNumber = Number.parseInt(rightSegment, 10);

            if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
                const compared = leftSegment.localeCompare(rightSegment);

                if (compared !== 0) {
                    return compared;
                }

                continue;
            }

            if (leftNumber !== rightNumber) {
                return leftNumber - rightNumber;
            }
        }

        return 0;
    }

    /**
     * Formats a date string from the Athom API to a short localized string.
     *
     * @param createdAt The ISO date string.
     */
    #formatDate(createdAt: string): string {
        const parsed = new Date(createdAt);

        if (Number.isNaN(parsed.getTime())) {
            return '';
        }

        return parsed.toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    /**
     * Persists the known app versions to settings.
     */
    #persistVersions(): void {
        const record: Record<string, string> = {};

        for (const [appId, version] of this.#knownVersions) {
            record[appId] = version;
        }

        this.settings.set(SETTINGS_KEY_KNOWN_VERSIONS, record);
    }

    /**
     * Persists the versions we have already notified the user about, so we
     * don't repeatedly notify for the same available version.
     */
    #persistNotifiedVersions(): void {
        const record: Record<string, string> = {};

        for (const [appId, version] of this.#notifiedAvailableVersions) {
            record[appId] = version;
        }

        this.settings.set(SETTINGS_KEY_NOTIFIED_VERSIONS, record);
    }
}
