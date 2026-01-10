import {
  App,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";

import { promptGPTChat } from "src/gpt";
import { ResultDialog } from "src/ui/result_dialog";

const defaultMaxTokens = 2000;
interface AiSummaryPluginSettings {
  openAiApiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  defaultPrompt: string;
}

const DEFAULT_SETTINGS: AiSummaryPluginSettings = {
  openAiApiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-3.5-turbo",
  maxTokens: defaultMaxTokens,
  defaultPrompt:
    "Write me a 2-3 paragraph summary of this in the first person.",
};

export default class AiSummaryPlugin extends Plugin {
  settings: AiSummaryPluginSettings;

  async generateSummary(): Promise<string> {
    const dialog = new ResultDialog(this.app);
    dialog.open();

    try {
      const { vault } = this.app;

      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

      const file = markdownView?.file;
      if (!file) {
        dialog.addContent("[AI-SUMMARY] Error: No note is currently open.");
        return "No note open.";
      }

      const content = await vault.cachedRead(file);
      const frontMatter = this.extractFrontmatter(content);

      const referencedNotes = await this.getReferencedContent(content, file);
      if (!referencedNotes || referencedNotes.length === 0) {
        dialog.addContent("[AI-SUMMARY] No referenced notes found.");
        return "No referenced notes found.";
      }

      await promptGPTChat(
        frontMatter["prompt"] ?? this.settings.defaultPrompt,
        this.generateGPTPrompt(referencedNotes),
        this.settings.openAiApiKey,
        this.settings.baseUrl,
        this.settings.model,
        this.settings.maxTokens,
        dialog
      );
      return "Summary written.";
    } catch (error) {
      console.error("[AI-SUMMARY] Error generating summary:", error);
      dialog.addContent(`[AI-SUMMARY] Error: Failed to generate summary - ${error.message}`);
      return "Failed to generate summary.";
    }
  }

  async summarizeCurrentDocument(): Promise<string> {
    const dialog = new ResultDialog(this.app);
    dialog.open();

    try {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const file = markdownView?.file;
      if (!file) {
        dialog.addContent("[AI-SUMMARY] Error: No note is currently open.");
        return "No note open.";
      }

      const content = await this.app.vault.cachedRead(file);
      const frontMatter = this.extractFrontmatter(content);

      // Remove frontmatter from content for summarization
      const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');

      if (!contentWithoutFrontmatter.trim()) {
        dialog.addContent("[AI-SUMMARY] The current document is empty.");
        return "The current document is empty.";
      }

      await promptGPTChat(
        frontMatter["prompt"] ?? this.settings.defaultPrompt,
        contentWithoutFrontmatter,
        this.settings.openAiApiKey,
        this.settings.baseUrl,
        this.settings.model,
        this.settings.maxTokens,
        dialog
      );

      return "Document summary generated.";
    } catch (error) {
      console.error("[AI-SUMMARY] Error generating document summary:", error);
      dialog.addContent(`[AI-SUMMARY] Error: Failed to generate document summary - ${error.message}`);
      return "Failed to generate document summary.";
    }
  }

  hasOpenNote(): boolean {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return !!markdownView?.file;
  }

  generateGPTPrompt(notes: string[]): string {
    let prompt = "";
    for (const note of notes) {
      prompt += note;
      prompt += "----";
    }
    return prompt;
  }

  async getReferencedContent(
    content: string,
    currentFile: TFile
  ): Promise<string[] | undefined> {
    const referencedNotes: string[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.includes("[[") && line.includes("]]")) {
        const links = this.extractTextBetweenBrackets(line);
        for (const link of links) {
          const noteLink = this.app.metadataCache.getFirstLinkpathDest(
            link,
            currentFile.path
          );
          referencedNotes.push(await this.readContents(noteLink));
        }
      }
    }
    return referencedNotes;
  }

  async readContents(note: TFile | null) {
    if (note) {
      return await this.app.vault.read(note);
    }
    return "";
  }

  extractTextBetweenBrackets(str: string): string[] {
    const regex = /\[\[([\s\S]*?)\]\]/g;
    const matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  }

  extractFrontmatter(md: string): Record<string, string> {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
    const match = md.match(frontmatterRegex);
    const frontmatter: Record<string, string> = {};

    if (match) {
      const frontmatterString = match[1];
      const frontmatterLines = frontmatterString.split("\n");
      frontmatterLines.forEach((line) => {
        const [key, value] = line.split(":").map((item) => item.trim());
        frontmatter[key.toLowerCase()] = value;
      });
    }

    return frontmatter;
  }

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("pencil", "Summarize referenced notes", async () => {
      const resultSummary = await this.generateSummary();
      new Notice(resultSummary);
    });

    this.addCommand({
      id: "ai-summary",
      name: "Summarize referenced notes",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return this.hasOpenNote();
        }
        (async () => {
          new Notice(await this.generateSummary());
        })();
      },
    });

    this.addCommand({
      id: "summarize-current-document",
      name: "Summarize current document",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return this.hasOpenNote();
        }
        (async () => {
          new Notice(await this.summarizeCurrentDocument());
        })();
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AiSummarySettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class AiSummarySettingTab extends PluginSettingTab {
  plugin: AiSummaryPlugin;

  constructor(app: App, plugin: AiSummaryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Settings for the AI Summary Plugin." });

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("OpenAI API Key")
      .addText((text) =>
        text
          .setPlaceholder("API Key")
          .setValue(this.plugin.settings.openAiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openAiApiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("Base URL for API requests")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Enter the model name")
      .addText((text) =>
        text
          .setPlaceholder("gpt-3.5-turbo")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max tokens")
      .setDesc("Max tokens")
      .addText((text) =>
        text
          .setPlaceholder(defaultMaxTokens.toString())
          .setValue(
            this.plugin.settings.maxTokens?.toString() ||
              defaultMaxTokens.toString()
          )
          .onChange(async (value) => {
            this.plugin.settings.maxTokens = Number.parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default prompt")
      .setDesc("Default system prompt")
      .addTextArea((text) =>
        text
          .setPlaceholder("Prompt")
          .setValue(this.plugin.settings.defaultPrompt)
          .onChange(async (value) => {
            this.plugin.settings.defaultPrompt = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
