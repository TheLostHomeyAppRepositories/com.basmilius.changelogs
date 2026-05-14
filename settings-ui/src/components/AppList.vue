<template>
    <FormFieldset
        :title="t('settings.apps.title')"
        :description="t('settings.apps.description')">
        <div
            v-if="isLoading"
            :class="$style.message">
            {{ t('settings.apps.loading') }}
        </div>

        <div
            v-else-if="items.length === 0"
            :class="$style.message">
            {{ t('settings.apps.empty') }}
        </div>

        <template v-else>
            <div :class="$style.toolbar">
                <span
                    v-if="updateCount > 0"
                    :class="$style.toolbarSummary">
                    {{ updateCount === 1
                        ? t('settings.update.summary_one')
                        : t('settings.update.summary_other', {count: String(updateCount)}) }}
                </span>

                <AppListSort v-model="sortBy"/>
            </div>

            <div :class="$style.list">
                <AppItem
                    v-for="app in sortedItems"
                    :key="app.id"
                    :app="app"
                    @open="onOpen"/>
            </div>
        </template>
    </FormFieldset>
</template>

<script
    lang="ts"
    setup>
    import { computed } from 'vue';
    import { useSortPreference, useTranslate } from '../composables';
    import type { InstalledAppView } from '../types';
    import AppItem from './AppItem.vue';
    import AppListSort from './AppListSort.vue';
    import FormFieldset from './FormFieldset.vue';

    const emit = defineEmits<{
        open: [InstalledAppView];
    }>();

    const props = defineProps<{
        readonly isLoading: boolean;
        readonly items: InstalledAppView[];
    }>();

    const t = useTranslate();
    const sortBy = useSortPreference();

    const updateCount = computed(() => props.items.filter((app) => app.hasUpdate).length);

    const sortedItems = computed<InstalledAppView[]>(() => {
        const copy = [...props.items];

        if (sortBy.value === 'name') {
            return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
        }

        if (sortBy.value === 'updates') {
            return copy.sort((a, b) => {
                if (a.hasUpdate !== b.hasUpdate) {
                    return a.hasUpdate ? -1 : 1;
                }

                return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
            });
        }

        return copy.sort((a, b) => {
            const dateA = a.latestChangelog?.rawDate ?? '';
            const dateB = b.latestChangelog?.rawDate ?? '';

            if (dateA === dateB) {
                return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
            }

            if (dateA === '') {
                return 1;
            }

            if (dateB === '') {
                return -1;
            }

            return dateB.localeCompare(dateA);
        });
    });

    function onOpen(app: InstalledAppView): void {
        emit('open', app);
    }
</script>

<style
    lang="scss"
    module>
    .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--homey-su-1);
        margin-bottom: var(--homey-su-1);
        flex-wrap: wrap;
    }

    .toolbarSummary {
        color: var(--homey-color-mono-60);
        font-size: var(--homey-font-size-small);
    }

    .list {
        display: flex;
        flex-flow: column;
    }

    .message {
        padding: var(--homey-su-2) 0;
        color: var(--homey-color-mono-60);
        font-style: italic;
    }
</style>
