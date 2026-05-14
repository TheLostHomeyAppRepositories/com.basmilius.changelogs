<template>
    <div :class="$style.appItem">
        <button
            type="button"
            class="hy-nostyle"
            :class="$style.appItemButton"
            @click="onClick">
            <span
                :class="$style.appItemIcon"
                :style="iconStyle">
                <img
                    v-if="app.iconUrl && !iconFailed"
                    :class="$style.appItemIconImage"
                    :src="app.iconUrl"
                    alt=""
                    loading="lazy"
                    @error="onIconError"/>
                <span
                    v-else
                    :class="$style.appItemIconFallback">
                    {{ fallbackLetter }}
                </span>
            </span>

            <span :class="$style.appItemBody">
                <span :class="$style.appItemName">
                    {{ app.name }}
                    <span :class="$style.appItemVersion">v{{ app.version }}</span>
                </span>

                <span
                    v-if="app.hasUpdate && app.latestVersion"
                    :class="$style.appItemBadge">
                    {{ t('settings.update.available_to', {version: app.latestVersion}) }}
                </span>

                <span :class="$style.appItemPreview">
                    {{ previewText }}
                </span>
            </span>

            <span :class="$style.appItemChevron" aria-hidden="true"/>
        </button>

        <button
            v-if="app.hasUpdate"
            type="button"
            class="hy-nostyle"
            :class="$style.appItemStoreLink"
            :title="t('settings.update.open_store')"
            @click="onOpenStore">
            <span :class="$style.appItemStoreIcon" aria-hidden="true"/>
            <span class="hy-visually-hidden">{{ t('settings.update.open_store') }}</span>
        </button>
    </div>
</template>

<script
    lang="ts"
    setup>
    import { computed, ref } from 'vue';
    import { useTranslate } from '../composables';
    import type { InstalledAppView } from '../types';

    const emit = defineEmits<{
        open: [InstalledAppView];
    }>();

    const {
        app
    } = defineProps<{
        readonly app: InstalledAppView;
    }>();

    const t = useTranslate();
    const iconFailed = ref(false);

    const iconStyle = computed(() => ({
        '--accent': app.brandColor ?? app.color ?? 'var(--homey-color-mono-30)'
    }));

    const fallbackLetter = computed(() => {
        const firstChar = app.name.trim().charAt(0);

        return firstChar.length > 0 ? firstChar.toUpperCase() : '?';
    });

    const previewText = computed(() => {
        if (!app.latestChangelog || app.latestChangelog.text.trim().length === 0) {
            return t('settings.apps.no_changelog');
        }

        return app.latestChangelog.text;
    });

    function onClick(): void {
        emit('open', app);
    }

    function onOpenStore(): void {
        void Homey.openURL(app.storeUrl);
    }

    function onIconError(): void {
        iconFailed.value = true;
    }
</script>

<style
    lang="scss"
    module>
    .appItem {
        display: flex;
        align-items: stretch;
        gap: 6px;
        margin-left: calc(var(--homey-su-2) * -1);
        margin-right: calc(var(--homey-su-2) * -1);
        padding-right: var(--homey-su-2);
        background: var(--homey-color-mono-0);
        border-bottom: 1px solid var(--homey-color-mono-05);
    }

    .appItem:first-child {
        border-top: 1px solid var(--homey-color-mono-05);
    }

    .appItem:hover {
        background: var(--homey-color-mono-01);
    }

    .appItemButton {
        display: flex;
        flex: 1 1 auto;
        padding: 12px var(--homey-su-2);
        align-items: center;
        gap: 15px;
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
        font: inherit;
        color: inherit;
    }

    .appItemIcon {
        display: flex;
        width: 48px;
        height: 48px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        background: var(--accent);
        border-radius: 50%;
        overflow: hidden;
    }

    .appItemIconImage {
        width: 50%;
        height: 50%;
        object-fit: contain;
        filter: brightness(0) invert(1);
    }

    .appItemIconFallback {
        color: #ffffff;
        font-size: 20px;
        font-weight: var(--homey-font-weight-bold);
    }

    .appItemBody {
        display: flex;
        min-width: 0;
        flex: 1 1 auto;
        flex-flow: column;
        gap: 4px;
    }

    .appItemName {
        display: flex;
        align-items: baseline;
        gap: 9px;
        flex-wrap: wrap;
        font-weight: var(--homey-font-weight-bold);
    }

    .appItemVersion {
        color: var(--homey-color-mono-50);
        font-size: var(--homey-font-size-small);
        font-weight: var(--homey-font-weight-regular);
    }

    .appItemBadge {
        display: inline-flex;
        align-self: flex-start;
        padding: 2px 9px;
        background: rgb(from #22c55e r g b / 0.15);
        border-radius: 999px;
        color: #15803d;
        font-size: var(--homey-font-size-tiny, 11px);
        font-weight: var(--homey-font-weight-medium);
        line-height: 1.4;
    }

    .appItemPreview {
        display: -webkit-box;
        overflow: hidden;
        color: var(--homey-color-mono-60);
        font-size: var(--homey-font-size-small);
        line-height: 1.4;
        text-overflow: ellipsis;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .appItemChevron {
        flex: 0 0 auto;
        width: 8px;
        height: 14px;
        background: var(--homey-color-mono-30);
        clip-path: polygon(0 0, 100% 50%, 0 100%);
    }

    .appItemStoreLink {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        align-self: center;
        background: var(--homey-color-mono-05);
        border: none;
        border-radius: 50%;
        color: var(--homey-color-mono-80);
        text-decoration: none;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        transition: background 160ms cubic-bezier(0.55, 0, 0.1, 1);

        &:hover,
        &:focus-visible {
            background: var(--homey-color-mono-10);
        }

        &:focus {
            outline: none;
        }

        &:focus-visible {
            outline: 2px solid var(--homey-color-blue-50, #2563eb);
            outline-offset: 2px;
        }
    }

    .appItemStoreIcon {
        display: block;
        width: 14px;
        height: 14px;
        background: currentColor;
        mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z'/></svg>") center / contain no-repeat;
        -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z'/></svg>") center / contain no-repeat;
    }

    :global(.hy-visually-hidden) {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }
</style>
