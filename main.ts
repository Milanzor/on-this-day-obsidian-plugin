import {App, requestUrl, Editor, moment, Notice, Plugin, PluginSettingTab, Setting} from 'obsidian';

// Remember to rename these classes and interfaces!

interface OnThisDayPluginSettings {
    accessToken: string;
    amountOfEvents: number;
    insertTitle: boolean;
    titleDateFormat: string;
}

interface OnThisDayItem {
    eventdescription: string;
    eventtype: string;
    eventyear: number;
}

const DEFAULT_SETTINGS: OnThisDayPluginSettings = {
    accessToken: "",
    amountOfEvents: 1,
    insertTitle: true,
    titleDateFormat: "MMMM Do"
}

export default class OnThisDayPlugin extends Plugin {
    settings: OnThisDayPluginSettings;
    onThisDayResponse: Array<OnThisDayItem> = [];

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

        this.onThisDayResponse = await this.getOnThisDayResponse();

    }

    async insert(editor: Editor, withTitle = false) {

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

        // Add the events to the text
        for (const event of this.onThisDayResponse.slice(0, this.settings.amountOfEvents)) {
            text += `* ${event.eventdescription}`;
            if (event.eventyear) {
                text += ` (${event.eventyear})\n`;
            } else {
                text += `\n`;
            }
        }

        return text;


    }

    async getOnThisDayResponse(): Promise<Array<OnThisDayItem>> {

        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const url = `https://on-this-day-api.helopsokken.nl/api/v1/events/that-happened-on/${month}/${day}`;

        try {

            const response = await requestUrl({
                url: url,
                headers: {
                    'Api-User-Agent': 'on-this-day-obsidian-plugin',
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
            });

            return response.json.data as Array<OnThisDayItem>

        } catch (error) {
            console.error(error);
            return [] as Array<OnThisDayItem>;
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

        const {containerEl} = this;

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

                        if (parsedValue > 10) {
                            parsedValue = 10;
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

    }
}
