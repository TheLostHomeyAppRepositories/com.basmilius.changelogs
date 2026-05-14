<template>
    <section :class="$style.section">
        <header :class="$style.header">
            <h2 :class="$style.title">{{ t('settings.preferences.title') }}</h2>
            <p :class="$style.description">{{ t('settings.preferences.description') }}</p>
        </header>

        <div :class="$style.list">
            <label :class="$style.row">
                <span :class="$style.rowText">
                    <span :class="$style.rowLabel">{{ t('settings.preferences.notify_label') }}</span>
                    <span :class="$style.rowDescription">{{ t('settings.preferences.notify_description') }}</span>
                </span>
                <span :class="[$style.toggle, {[$style.toggleOn]: preferences.notifyOnUpdateAvailable}]">
                    <input
                        type="checkbox"
                        :class="$style.toggleInput"
                        :checked="preferences.notifyOnUpdateAvailable"
                        :disabled="isDisabled"
                        @change="onNotifyChange"/>
                    <span :class="$style.toggleThumb" aria-hidden="true"/>
                </span>
            </label>

            <label :class="$style.row">
                <span :class="$style.rowText">
                    <span :class="$style.rowLabel">{{ t('settings.preferences.test_label') }}</span>
                    <span :class="$style.rowDescription">{{ t('settings.preferences.test_description') }}</span>
                </span>
                <span :class="[$style.toggle, {[$style.toggleOn]: preferences.includeTestBuilds}]">
                    <input
                        type="checkbox"
                        :class="$style.toggleInput"
                        :checked="preferences.includeTestBuilds"
                        :disabled="isDisabled"
                        @change="onTestChange"/>
                    <span :class="$style.toggleThumb" aria-hidden="true"/>
                </span>
            </label>
        </div>
    </section>
</template>

<script
    lang="ts"
    setup>
    import { computed } from 'vue';
    import { useTranslate } from '../composables';
    import type { AppPreferences } from '../types';

    const emit = defineEmits<{
        update: [Partial<AppPreferences>];
    }>();

    const props = defineProps<{
        readonly preferences: AppPreferences;
        readonly isLoading: boolean;
        readonly isSaving: boolean;
    }>();

    const t = useTranslate();
    const isDisabled = computed(() => props.isLoading || props.isSaving);

    function onNotifyChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        emit('update', {notifyOnUpdateAvailable: target.checked});
    }

    function onTestChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        emit('update', {includeTestBuilds: target.checked});
    }
</script>

<style
    lang="scss"
    module>
    .section {
        margin: 0 0 var(--homey-su-3);
        padding: 0;
        text-transform: none;
        letter-spacing: normal;
    }

    .header {
        margin-bottom: var(--homey-su-1);
    }

    .title {
        margin: 0 0 6px;
        color: var(--homey-color-mono-100);
        font-size: var(--homey-font-size-default);
        font-weight: var(--homey-font-weight-bold);
        text-transform: none;
        letter-spacing: normal;
    }

    .description {
        margin: 0;
        color: var(--homey-color-mono-60);
        font-size: var(--homey-font-size-small);
        line-height: 1.4;
        text-transform: none;
        letter-spacing: normal;
        text-wrap: pretty;
    }

    .list {
        display: flex;
        flex-flow: column;
    }

    .row {
        display: flex;
        align-items: center;
        gap: var(--homey-su-2);
        padding: 12px 0;
        border-top: 1px solid var(--homey-color-mono-05);
        cursor: pointer;
        text-transform: none;
        letter-spacing: normal;
    }

    .row:last-child {
        border-bottom: 1px solid var(--homey-color-mono-05);
    }

    .rowText {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
        flex-flow: column;
        gap: 3px;
        text-transform: none;
        letter-spacing: normal;
    }

    .rowLabel {
        color: var(--homey-color-mono-100);
        font-size: var(--homey-font-size-default);
        font-weight: var(--homey-font-weight-medium);
        text-transform: none;
        letter-spacing: normal;
    }

    .rowDescription {
        color: var(--homey-color-mono-60);
        font-size: var(--homey-font-size-small);
        line-height: 1.4;
        text-transform: none;
        letter-spacing: normal;
        text-wrap: pretty;
    }

    .toggle {
        position: relative;
        flex: 0 0 auto;
        display: inline-flex;
        width: 44px;
        height: 26px;
        background: var(--homey-color-mono-15, var(--homey-color-mono-10));
        border-radius: 999px;
        transition: background 160ms cubic-bezier(0.55, 0, 0.1, 1);
    }

    .toggleOn {
        background: #22c55e;
    }

    .toggleInput {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        border: none;
        opacity: 0;
        cursor: pointer;
        z-index: 1;

        &:disabled {
            cursor: not-allowed;
        }
    }

    .toggleThumb {
        position: absolute;
        top: 3px;
        left: 3px;
        display: block;
        width: 20px;
        height: 20px;
        background: #ffffff;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgb(from var(--homey-color-mono-90) r g b / 0.25);
        transition: translate 160ms cubic-bezier(0.55, 0, 0.1, 1);
        pointer-events: none;
    }

    .toggleOn .toggleThumb {
        translate: 18px 0;
    }

    .toggle:has(.toggleInput:disabled) {
        opacity: 0.5;
    }
</style>
