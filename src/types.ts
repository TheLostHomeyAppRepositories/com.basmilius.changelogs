import type App from './index';

export type ChangelogsApp = App;

/**
 * Represents the stored version info for an installed app.
 */
export type AppVersionRecord = {
    readonly [appId: string]: string;
};

/**
 * Represents an installed app from the Homey API.
 */
export type InstalledApp = {
    readonly id: string;
    readonly name: string;
    readonly version: string;
};

/**
 * Represents a single changelog entry from the Athom API.
 */
export type ChangelogEntry = {
    readonly createdAt: string;
    readonly changelog: {
        readonly [locale: string]: string;
    };
};

/**
 * Represents the changelog API response from Athom.
 */
export type ChangelogApiResponse = {
    readonly [version: string]: ChangelogEntry;
};

/**
 * Represents a lightweight changelog preview for the settings list view.
 *
 * `isFallback` is true when the requested version was not found in the
 * Athom changelog response and the most recent entry was returned instead.
 */
export type ChangelogPreview = {
    readonly version: string;
    readonly text: string;
    readonly date: string;
    readonly rawDate: string;
    readonly isFallback: boolean;
};

/**
 * Represents a single entry in the full changelog as shown in the modal.
 */
export type ChangelogEntryView = {
    readonly version: string;
    readonly text: string;
    readonly date: string;
    readonly rawDate: string;
};

/**
 * Represents the full changelog for an app, sorted newest first.
 */
export type ChangelogFull = ChangelogEntryView[];

/**
 * Represents the latest available versions for a Homey app on the Athom store.
 */
export type AppVersionInfo = {
    readonly liveVersion: string | null;
    readonly testVersion: string | null;
    readonly storeUrl: string;
};

/**
 * Represents an installed app enriched with icon, accent color, the latest
 * changelog entry, and the latest available version info from the Athom store.
 * Used by the settings overview.
 */
export type InstalledAppView = InstalledApp & {
    readonly iconUrl: string | null;
    readonly color: string | null;
    readonly brandColor: string | null;
    readonly latestChangelog: ChangelogPreview | null;
    readonly latestVersion: string | null;
    readonly latestTestVersion: string | null;
    readonly hasUpdate: boolean;
    readonly hasTestUpdate: boolean;
    readonly storeUrl: string;
};

/**
 * Represents the user-configurable preferences for the Changelogs app.
 */
export type AppPreferences = {
    readonly notifyOnUpdateAvailable: boolean;
    readonly includeTestBuilds: boolean;
};
