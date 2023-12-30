import {App, requestUrl, Editor, moment, Modal, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent} from 'obsidian';

// Remember to rename these classes and interfaces!

interface OnThisDayPluginSettings {
    amountOfEvents: string;
    insertTitle: boolean;
    titleDateFormat: string;
    titleTemplate: string;
    itemTemplate: string;
}

interface OnThisDayItem {
    eventdescription: string;
    eventtype: string;
    eventyear: number;
}

const DEFAULT_SETTINGS: OnThisDayPluginSettings = {
    titleTemplate: "## On this day ({{currentdate}})\n\n",
    itemTemplate: "* {{eventdescription}} {{if eventyear}}({{eventyear}}){{endif}}\n",
    amountOfEvents: "3",
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
                await this.insert(editor);
            },
        });

        this.onThisDayResponse = await this.getOnThisDayResponse();

    }

    async insert(editor: Editor) {

        if (!this.hasOnThisDayResponse()) {

            this.onThisDayResponse = await this.getOnThisDayResponse();

            if (!this.hasOnThisDayResponse()) {
                new Notice("Error fetching text for today");
                return;
            }

        }

        const onThisDayText = this.getOnThisDayText();

        // If a selection is made, replace it with the text
        if (editor.somethingSelected()) {
            editor.replaceSelection(onThisDayText);
            return;
        }

        const cursor = editor.getCursor();

        editor.replaceRange(
            onThisDayText,
            cursor
        );

    }

    hasOnThisDayResponse(): boolean {
        return this.onThisDayResponse.length > 0;
    }

    getOnThisDayText(): string {

        if (!this.hasOnThisDayResponse()) {
            return "";
        }

        if (this.settings.itemTemplate === "") {
            return "";
        }

        let text = `${this.settings.titleTemplate}`;

        text = text.replace('{{currentdate}}', moment().format(this.settings.titleDateFormat));

        for (const event of this.onThisDayResponse.slice(0, parseInt(this.settings.amountOfEvents))) {

            let eventText = `${this.settings.itemTemplate}`;

            eventText = eventText.replace('{{eventdescription}}', event.eventdescription);

            // Replace everything between {{if eventyear}} and {{endif}} if eventyear is not set
            if (!event.eventyear) {
                eventText = eventText.replace(/{{if eventyear}}([\s\S]*?){{endif}}/g, '');
            }

            eventText = eventText.replace(/{{if eventyear}}/g, '');
            eventText = eventText.replace(/{{endif}}/g, '');
            eventText = eventText.replace('{{eventyear}}', event.eventyear.toString());


            text += eventText;
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
            .setName("Amount of items")
            .setDesc("The amount of items to insert (max 10)")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.amountOfEvents)
                    .setValue(this.plugin.settings.amountOfEvents)
                    .onChange(async (value) => {

                        let parsedValue = parseInt(value);

                        if (parsedValue < 1) {
                            parsedValue = 1;
                        }

                        if (parsedValue > 10) {
                            parsedValue = 10;
                        }

                        this.plugin.settings.amountOfEvents = parsedValue.toString() === "NaN" ? DEFAULT_SETTINGS.amountOfEvents : parsedValue.toString();

                        await this.plugin.saveSettings();
                    })
            );


        new Setting(containerEl)
            .setName("Title template")
            .setDesc("The template that will be used for the title item that will be inserted. Use {{currentdate}} insert the formatted date (see the \"Title date format\" setting to specify the date format).")

            .addText((textArea) =>
                textArea
                    .setPlaceholder(DEFAULT_SETTINGS.titleTemplate)
                    .setValue(this.plugin.settings.titleTemplate.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.titleTemplate = value === "" ? `${DEFAULT_SETTINGS.titleTemplate}` : value.trim() + "\n\n";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Title date format")
            .setDesc("The date format of the title")
            .setClass('title-date-format-setting')
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.titleDateFormat)
                    .setValue(this.plugin.settings.titleDateFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.titleDateFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Item template")
            .setDesc("The template that will be used for each item that will be inserted. Use {{eventdescription}} and {{eventyear}} to insert the values. Use {{if eventyear}} and {{endif}} to only show the year if it is set.")
            .addText((textArea) =>
                textArea
                    .setPlaceholder(DEFAULT_SETTINGS.itemTemplate)
                    .setValue(this.plugin.settings.itemTemplate.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.itemTemplate = value === "" ? `${DEFAULT_SETTINGS.itemTemplate}` : value.trim() + "\n";
                        await this.plugin.saveSettings();
                    })
            );


        new ButtonComponent(containerEl)
            .setButtonText("Reset settings to default")
            .setWarning()
            .setClass('reset-to-default-button')
            .onClick(async () => {
                new ResetSettingsToDefaultConfirmationModal(this.app, (reset) => {
                    if (reset) {
                        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                        this.display();
                        this.plugin.saveSettings();
                        new Notice("Settings reset to default (On this day plugin)");
                    }
                }).open();
            });


    }
}


class ResetSettingsToDefaultConfirmationModal extends Modal {

    onSubmit: (result: boolean) => void;

    constructor(app: App, onSubmit: (result: boolean) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;

        contentEl.createEl('h2', {text: 'Are you sure?'});

        contentEl.createEl('p', {text: 'Are you sure you want to reset the settings to the default settings?'});

        new ButtonComponent(contentEl)
            .setButtonText("Reset settings to default")
            .setClass('reset-to-default-button-confirm-button')
            .setWarning()
            .onClick(async () => {
                this.onSubmit(true);
                this.close();
            });

        new ButtonComponent(contentEl)
            .setButtonText('Cancel')
            .onClick(async () => {
                this.onSubmit(false);
                this.close();
            });

    }


}
