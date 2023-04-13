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
    const container = contentEl.createEl("div", { cls: "item" });
    this.text = container.createEl("textarea", { cls: "content" });
    this.text.placeholder = "Enter some text";
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
