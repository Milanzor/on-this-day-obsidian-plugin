import {App, requestUrl, Editor, moment, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting} from 'obsidian';

// Remember to rename these classes and interfaces!

interface OnThisDayPluginSettings {
    accessToken: string;
    amountOfEvents: number;
    insertTitle: boolean;
    titleDateFormat: string;
    categories: {
        selected: boolean;
        births: boolean;
        deaths: boolean;
        events: boolean;
    }
}

type Category = "selected" | "births" | "deaths" | "events";

interface OnThisDayItem {
    text: string;
    year: number;
}

interface OnThisDayResponse {
    selected: Array<OnThisDayItem>;
    births: Array<OnThisDayItem>;
    deaths: Array<OnThisDayItem>;
    events: Array<OnThisDayItem>;
}

const DEFAULT_SETTINGS: OnThisDayPluginSettings = {
    accessToken: "",
    amountOfEvents: 1,
    insertTitle: true,
    titleDateFormat: "MMMM Do",
    categories: {
        selected: true,
        births: true,
        deaths: true,
        events: true
    }
}

export default class OnThisDayPlugin extends Plugin {
    settings: OnThisDayPluginSettings;
    onThisDayResponse: OnThisDayResponse = {} as OnThisDayResponse;

    async onload() {

        await this.loadSettings();

        this.addSettingTab(new OnThisDaySettingsTab(this.app, this));

        this.addCommand({
            id: "insert-on-this-day-text-with-title",
            name: "Insert",
            editorCallback: async (editor: Editor) => {
                await this.insert(editor, true);
            },
        });

        this.addCommand({
            id: "insert-on-this-day-text-without-title",
            name: "Insert (without title)",
            editorCallback: async (editor: Editor) => {
                await this.insert(editor, false);
            },
        });

        if (this.settings.accessToken) {
            this.onThisDayResponse = await this.getOnThisDayResponse();
        }

    }

    async insert(editor: Editor, withTitle: boolean = false){

        if (!this.settings.accessToken) {
            new Notice("Please set your access token in the settings.");
            return;
        }

        // If the on this day response is empty, get it
        if (Object.keys(this.onThisDayResponse).length === 0) {

            this.onThisDayResponse = await this.getOnThisDayResponse();

            // If it's still empty, return
            if (Object.keys(this.onThisDayResponse).length === 0) {
                new Notice("Error getting on this day text");
                return;
            }

        }


        // If a selection is made, replace it with the text
        if (editor.somethingSelected()) {
            editor.replaceSelection(this.getOnThisDayText(withTitle));
            return;
        }

        editor.replaceRange(
            this.getOnThisDayText(withTitle),
            editor.getCursor()
        );

        editor.setCursor({line: editor.getCursor().line + 1, ch: 0});
    }


    getOnThisDayText(withTitle: boolean): string {

        if (!this.onThisDayResponse) {
            return "";
        }

        let text = "";

        if (withTitle) {
            text += `## On this day (${moment().format(this.settings.titleDateFormat)})\n\n`;
        }

        let eventsArray: Array<OnThisDayItem> = [];

        // Fetch a random event from each category until we hit the amount of events we want
        while (eventsArray.length < this.settings.amountOfEvents) {

                let category: Category = Object.keys(this.onThisDayResponse)[Math.floor(Math.random() * Object.keys(this.onThisDayResponse).length)] as Category;

                // If the category is not selected, skip it
                if (!this.settings.categories[category]) {
                    continue;
                }

                let event = this.onThisDayResponse[category][Math.floor(Math.random() * this.onThisDayResponse[category].length)];

                // If the event is already in the array, skip it
                if (eventsArray.includes(event)) {
                    continue;
                }

                eventsArray.push(event);

        }


        // Sort the events by year
        eventsArray.sort((a, b) => a.year - b.year);

        // Add the events to the text
        for (const event of eventsArray) {
            text += `* ${event.text} (${event.year})\n`;
        }

        return text;


    }

    async getOnThisDayResponse(): Promise<OnThisDayResponse> {


        if (!this.settings.accessToken) {
            new Notice("Please set your access token in the settings.");
            return {} as OnThisDayResponse;
        }

        let today = new Date();
        let month = String(today.getMonth() + 1).padStart(2, '0');
        let day = String(today.getDate()).padStart(2, '0');
        let url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${month}/${day}`;

        try {

            let response = await requestUrl({
                url: url,
                headers: {
                    'Api-User-Agent': 'on-this-day-obsidian-plugin (milanvanas+on-this-day-obsidian@gmail.com)',
                    "Authorization": "Bearer " + this.settings.accessToken,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }

            });

            return response.json;

        } catch (error) {
            console.error(error);
            return {} as OnThisDayResponse;
        }


    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

export class OnThisDaySettingsTab extends PluginSettingTab {
    plugin: OnThisDayPlugin;

    constructor(app: App, plugin: OnThisDayPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {

        let {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Wikimedia Access token")
            .setDesc("Get your Access token from https://api.wikimedia.org/wiki/Special:AppManagement")
            .addTextArea((text) =>
                text
                    .setPlaceholder("Your Access token")
                    .setValue(this.plugin.settings.accessToken)
                    .onChange(async (value) => {

                        this.plugin.settings.accessToken = value;
                        await this.plugin.saveSettings();

                        if (value && Object.keys(this.plugin.onThisDayResponse).length === 0) {
                            this.plugin.onThisDayResponse = await this.plugin.getOnThisDayResponse();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Amount of items")
            .setDesc("The amount of items to insert")
            .addText((text) =>
                text
                    .setPlaceholder("Amount of items")
                    .setValue(this.plugin.settings.amountOfEvents.toString())
                    .onChange(async (value) => {

                        let parsedValue = parseInt(value);

                        if (parsedValue < 1) {
                            parsedValue = 1;
                        }

                        if (parsedValue > 30) {
                            parsedValue = 30;
                        }

                        this.plugin.settings.amountOfEvents = parsedValue;

                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Title date format")
            .setDesc("The date format of the title")
            .setClass('title-date-format-setting')
            .addText((text) =>
                text
                    .setPlaceholder("Title date format (MMMM-Do)")
                    .setValue(this.plugin.settings.titleDateFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.titleDateFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Dropdown for category
        containerEl.createEl('h2', {text: 'Categories'});
        containerEl.createEl('p', {text: 'Select the categories you want to include'});
        const categories = ['Selected by Wikipedia', 'Births', 'Deaths', 'Events'];
        const categorySettings = new Map<string, Setting>();

        // @ts-ignore
        for (const category: Category of categories) {
            const setting = new Setting(containerEl)
                .setName(category)
                .addToggle((toggle) =>
                    toggle
                        .setValue(true)
                        .onChange(async (value) => {

                            // @ts-ignore
                            this.plugin.settings.categories[category] = value;

                            await this.plugin.saveSettings();

                        })
                );
            categorySettings.set(category, setting);
        }




    }
}
