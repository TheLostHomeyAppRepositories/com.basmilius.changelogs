<template>
    <Top
        :title="t('settings.title')"
        :subtitle="t('settings.subtitle')"/>

    <Form>
        <Preferences
            :preferences="preferences"
            :is-loading="isLoadingPreferences"
            :is-saving="isSavingPreferences"
            @update="onPreferencesUpdate"/>

        <AppList
            :is-loading="isLoading"
            :items="items"
            @open="onOpen"/>
    </Form>

    <Transition name="modal">
        <ChangelogModal
            v-if="openedApp"
            :app="openedApp"
            :entries="entries"
            :is-loading="isLoadingChangelog"
            @close="onClose"/>
    </Transition>
</template>

<script
    lang="ts"
    setup>
    import { onMounted, ref } from 'vue';
    import { AppList, ChangelogModal, Form, Preferences, Top } from './components';
    import { useApps, useChangelog, usePreferences, useTranslate } from './composables';
    import type { AppPreferences, InstalledAppView } from './types';

    const t = useTranslate();
    const {items, isLoading, load: loadApps} = useApps();
    const {entries, isLoading: isLoadingChangelog, load: loadChangelog, reset: resetChangelog} = useChangelog();
    const {
        preferences,
        isLoading: isLoadingPreferences,
        isSaving: isSavingPreferences,
        load: loadPreferences,
        update: updatePreferences
    } = usePreferences();

    const openedApp = ref<InstalledAppView | null>(null);

    onMounted(async () => {
        await Promise.all([loadPreferences(), loadApps()]);
        Homey.ready();
    });

    async function onOpen(app: InstalledAppView): Promise<void> {
        openedApp.value = app;
        await loadChangelog(app.id);
    }

    function onClose(): void {
        openedApp.value = null;
        resetChangelog();
    }

    async function onPreferencesUpdate(patch: Partial<AppPreferences>): Promise<void> {
        const previous = {...preferences.value};

        await updatePreferences(patch);

        if (previous.includeTestBuilds !== preferences.value.includeTestBuilds) {
            await loadApps();
        }
    }
</script>

<style
    lang="scss"
    module>
    :global(.modal-enter-active),
    :global(.modal-leave-active) {
        transition: 320ms cubic-bezier(0.55, 0, 0.1, 1);
        transition-property: opacity, translate;
    }

    :global(.modal-enter-from),
    :global(.modal-leave-to) {
        opacity: 0;
        translate: 0 30px;
    }
</style>
