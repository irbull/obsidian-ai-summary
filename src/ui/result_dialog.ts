import { App, Modal } from "obsidian";

export class ResultDialog extends Modal {
  text: HTMLTextAreaElement;
  constructor(app: App) {
    super(app);
  }

  addContent(text: string) {
    this.text.setText(this.text.getText() + text);
  }

  onOpen() {
    const { contentEl } = this;
    const container = contentEl.createEl("div", {
      cls: "ai-summary-container",
    });
    this.text = container.createEl("textarea", { cls: "ai-summary-textarea" });
    this.text.placeholder = "...";
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
