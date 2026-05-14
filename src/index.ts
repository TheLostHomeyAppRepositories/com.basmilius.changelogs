import { App } from '@basmilius/homey-common';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import { Actions, AutocompleteProviders, Triggers } from './flow';
import ChangelogService from './changelogService';

/**
 * Main Changelogs app class that monitors installed Homey apps for updates
 * and provides flow triggers with changelog information.
 */
export default class ChangelogsApp extends App<ChangelogsApp> {
    /**
     * Returns the Homey Web API instance.
     */
    get api(): HomeyAPIV3Local {
        return this.#api;
    }

    /**
     * Returns the changelog service.
     */
    get changelogs(): ChangelogService {
        return this.#changelogs;
    }

    #api!: HomeyAPIV3Local;
    readonly #changelogs: ChangelogService;

    constructor(...args: any[]) {
        super(...args);

        this.#changelogs = new ChangelogService(this);
    }

    async onInit(): Promise<void> {
        try {
            this.#api = await HomeyAPI.createAppAPI({
                homey: this.homey
            }) as HomeyAPIV3Local;

            this.#registerAutocompleteProviders();
            this.#registerActions();
            this.#registerTriggers();

            await this.#changelogs.initialize();

            this.log('Changelogs app has been initialized!');
        } catch (err) {
            this.error('Failed to initialize the Changelogs app.', err);
        }
    }

    async onUninit(): Promise<void> {
        await this.#changelogs.destroy();
    }

    #registerAutocompleteProviders(): void {
        this.registry.autocompleteProvider(AutocompleteProviders.App);
    }

    #registerActions(): void {
        this.registry.action(Actions.GetChangelog);
    }

    #registerTriggers(): void {
        this.registry.trigger(Triggers.AppUpdated);
        this.registry.trigger(Triggers.UpdateAvailable);
    }
}
