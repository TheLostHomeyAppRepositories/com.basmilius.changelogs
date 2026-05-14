import { ref, watch } from 'vue';
import type { AppPreferences, ChangelogFull, InstalledAppView, SortBy } from './types';

const SORT_BY_STORAGE_KEY = 'changelogs:sort-by';
const SORT_BY_VALUES: readonly SortBy[] = ['updates', 'name', 'recent'];

export function useTranslate() {
    return (key: string, tags?: Record<string, string>) => {
        let result = (tags ? Homey.__(key, tags) : Homey.__(key)) ?? key;

        if (tags) {
            for (const [tagKey, tagValue] of Object.entries(tags)) {
                result = result.replaceAll(`{{${tagKey}}}`, tagValue);
            }
        }

        return result;
    };
}

export function useApps() {
    const items = ref<InstalledAppView[]>([]);
    const isLoading = ref(true);

    const load = async () => {
        isLoading.value = true;
        items.value = await Homey.api<InstalledAppView[]>('GET', '/apps');
        isLoading.value = false;
    };

    return {
        isLoading,
        items,
        load
    };
}

export function useChangelog() {
    const entries = ref<ChangelogFull>([]);
    const isLoading = ref(false);

    const load = async (appId: string) => {
        isLoading.value = true;
        entries.value = [];

        try {
            entries.value = await Homey.api<ChangelogFull>('GET', `/apps/${encodeURIComponent(appId)}/changelog`);
        } finally {
            isLoading.value = false;
        }
    };

    const reset = () => {
        entries.value = [];
    };

    return {
        entries,
        isLoading,
        load,
        reset
    };
}

export function usePreferences() {
    const preferences = ref<AppPreferences>({
        notifyOnUpdateAvailable: true,
        includeTestBuilds: false
    });
    const isLoading = ref(true);
    const isSaving = ref(false);

    const load = async () => {
        isLoading.value = true;

        try {
            preferences.value = await Homey.api<AppPreferences>('GET', '/preferences');
        } finally {
            isLoading.value = false;
        }
    };

    const update = async (patch: Partial<AppPreferences>) => {
        isSaving.value = true;

        try {
            preferences.value = await Homey.api<AppPreferences>('PUT', '/preferences', patch);
        } finally {
            isSaving.value = false;
        }
    };

    return {
        preferences,
        isLoading,
        isSaving,
        load,
        update
    };
}

export function useSortPreference(defaultValue: SortBy = 'updates') {
    const sortBy = ref<SortBy>(readSortBy(defaultValue));

    watch(sortBy, (value) => {
        try {
            localStorage.setItem(SORT_BY_STORAGE_KEY, value);
        } catch {
            // Ignore quota or access errors; the preference simply won't persist.
        }
    });

    return sortBy;
}

function readSortBy(defaultValue: SortBy): SortBy {
    try {
        const stored = localStorage.getItem(SORT_BY_STORAGE_KEY);

        if (stored !== null && SORT_BY_VALUES.includes(stored as SortBy)) {
            return stored as SortBy;
        }
    } catch {
        // Storage might be unavailable; fall back to default.
    }

    return defaultValue;
}
