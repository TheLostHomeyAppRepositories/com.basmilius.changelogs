import { FlowTriggerEntity, trigger } from '@basmilius/homey-common';
import type { ChangelogsApp } from '../../types';

/**
 * Trigger that fires when a newer version of an installed Homey app is
 * available on the Athom store.
 */
@trigger('update_available')
export default class extends FlowTriggerEntity<ChangelogsApp, never, Record<string, never>, Tokens> {
    async onRun(): Promise<boolean> {
        return true;
    }
}

type Tokens = {
    readonly app_name: string;
    readonly app_id: string;
    readonly current_version: string;
    readonly latest_version: string;
    readonly changelog: string;
    readonly date: string;
};
