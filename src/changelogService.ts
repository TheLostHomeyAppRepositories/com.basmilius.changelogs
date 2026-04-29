import {Shortcuts} from '@basmilius/homey-common';
import type {
    ChangelogApiResponse,
    ChangelogEntryView,
    ChangelogFull,
    ChangelogPreview,
    ChangelogsApp,
    InstalledApp,
    InstalledAppView
} from './types';
import {Triggers} from './flow';

const CHANGELOG_API_URL = 'https://apps-api.athom.com/api/v1/app';
const CHANGELOG_CACHE_TTL_MS = 600_000;
const POLL_INTERVAL_MS = 300_000;
const SETTINGS_KEY = 'knownAppVersions';

type CachedChangelog = {
    readonly response: ChangelogApiResponse | null;
    readonly fetchedAt: number;
};

type RawInstalledApp = InstalledApp & {
    readonly iconObj: unknown;
    readonly color: unknown;
    readonly brandColor: unknown;
};

/**
 * Service that monitors installed Homey apps for updates and fires triggers
 * with changelog information when an app has been updated.
 */
export default class ChangelogService extends Shortcuts<ChangelogsApp> {
    #knownVersions: Map<string, string> = new Map();
    #pollInterval: NodeJS.Timeout | null = null;
    #changelogCache: Map<string, CachedChangelog> = new Map();

    /**
     * Starts the service by capturing the current app versions and beginning the poll interval.
     */
    async initialize(): Promise<void> {
        const apps = await this.#getInstalledApps();

        this.log(`Found ${apps.length} installed apps:`);
        for (const app of apps) {
            this.log(`  - ${app.name} (${app.id}) v${app.version}`);
        }

        const stored = this.settings.get(SETTINGS_KEY) as Record<string, string> | null;

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
     * Returns all installed apps enriched with icon, brand color, and the
     * latest changelog entry. Used by the settings overview.
     */
    async getInstalledAppsWithChangelog(): Promise<InstalledAppView[]> {
        const apps = await this.#getRawInstalledApps();

        const enriched = await Promise.all(apps.map(async (app) => {
            const latestChangelog = await this.fetchLatestChangelog(app.id, app.version);

            return {
                id: app.id,
                name: app.name,
                version: app.version,
                iconUrl: this.#extractIconUrl(app.iconObj, app.id),
                color: this.#normalizeColor(app.color),
                brandColor: this.#normalizeColor(app.brandColor),
                latestChangelog
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
            const url = `${CHANGELOG_API_URL}/${appId}/changelog`;
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
     * Fetches the latest changelog entry for the given app version.
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

        if (!entry) {
            return null;
        }

        return {
            version,
            text: this.#pickChangelogText(entry.changelog),
            date: this.#formatDate(entry.createdAt),
            rawDate: entry.createdAt
        };
    }

    /**
     * Polls the installed apps for version changes and fires triggers for updated apps.
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

            this.#persistVersions();

            for (const {app, previousVersion} of updatedApps) {
                await this.#handleAppUpdated(app, previousVersion);
            }
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

        // The update likely invalidates any cached changelog for this app.
        this.#changelogCache.delete(app.id);

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

        this.settings.set(SETTINGS_KEY, record);
    }
}
