<template>
    <div
        :class="$style.sort"
        role="group"
        :aria-label="t('settings.apps.sort.label')">
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="hy-nostyle"
            :class="[$style.sortButton, { [$style.sortButtonActive]: modelValue === option.value }]"
            :aria-pressed="modelValue === option.value"
            @click="onSelect(option.value)">
            {{ t(option.labelKey) }}
        </button>
    </div>
</template>

<script
    lang="ts"
    setup>
    import { useTranslate } from '../composables';
    import type { SortBy } from '../types';

    const emit = defineEmits<{
        'update:modelValue': [SortBy];
    }>();

    defineProps<{
        readonly modelValue: SortBy;
    }>();

    const t = useTranslate();

    const options: ReadonlyArray<{readonly value: SortBy; readonly labelKey: string}> = [
        {value: 'name', labelKey: 'settings.apps.sort.alphabetical'},
        {value: 'recent', labelKey: 'settings.apps.sort.recently_updated'}
    ];

    function onSelect(value: SortBy): void {
        emit('update:modelValue', value);
    }
</script>

<style
    lang="scss"
    module>
    .sort {
        display: inline-flex;
        padding: 3px;
        background: var(--homey-color-mono-05);
        border-radius: 999px;
    }

    .sortButton {
        padding: 6px 12px;
        background: transparent;
        border: none;
        border-radius: 999px;
        cursor: pointer;
        color: var(--homey-color-mono-60);
        font: inherit;
        font-size: var(--homey-font-size-small);
        font-weight: var(--homey-font-weight-medium);
        transition: 160ms cubic-bezier(0.55, 0, 0.1, 1);
        transition-property: background, color;
    }

    .sortButton:hover:not(.sortButtonActive) {
        color: var(--homey-color-mono-80);
    }

    .sortButtonActive {
        background: var(--homey-color-mono-0);
        color: var(--homey-color-mono-100);
        box-shadow: 0 1px 2px rgb(from var(--homey-color-mono-90) r g b / 0.1);
    }
</style>
