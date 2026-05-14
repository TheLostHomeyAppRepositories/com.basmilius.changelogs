import type {ApiRequest} from '@basmilius/homey-common';
import type {AppPreferences, ChangelogFull, ChangelogsApp, InstalledAppView} from './src/types';

type ChangelogParams = {
    readonly appId: string;
};

type SetPreferencesBody = Partial<AppPreferences>;

/**
 * Returns every installed Homey app with its icon, brand color, the latest
 * changelog entry, and the latest available version on the Athom store.
 */
export async function getApps({homey: {app}}: ApiRequest<ChangelogsApp>): Promise<InstalledAppView[]> {
    return await app.changelogs.getInstalledAppsWithChangelog();
}

/**
 * Returns the full changelog (all versions, newest first) for the given app.
 */
export async function getChangelog({homey: {app}, params}: ApiRequest<ChangelogsApp, never, ChangelogParams>): Promise<ChangelogFull> {
    return await app.changelogs.getFullChangelog(params.appId);
}

/**
 * Returns the user-configurable preferences for the Changelogs app.
 */
export async function getPreferences({homey: {app}}: ApiRequest<ChangelogsApp>): Promise<AppPreferences> {
    return app.changelogs.getPreferences();
}

/**
 * Updates the user-configurable preferences for the Changelogs app and
 * returns the resulting state.
 */
export async function setPreferences({homey: {app}, body}: ApiRequest<ChangelogsApp, SetPreferencesBody>): Promise<AppPreferences> {
    return app.changelogs.setPreferences(body ?? {});
}
