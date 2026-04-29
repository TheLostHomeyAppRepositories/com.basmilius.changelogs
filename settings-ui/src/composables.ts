import { ref, watch } from 'vue';
import type { ChangelogFull, InstalledAppView, SortBy } from './types';

const SORT_BY_STORAGE_KEY = 'changelogs:sort-by';
const SORT_BY_VALUES: readonly SortBy[] = ['name', 'recent'];

export function useTranslate() {
    return (key: string) => Homey.__(key) ?? key;
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

export function useSortPreference(defaultValue: SortBy = 'recent') {
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
