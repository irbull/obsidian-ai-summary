import { ResultDialog } from "./ui/result_dialog";
const url = "https://api.openai.com/v1/chat/completions";

interface GPTResponse {
  choices: { message: { content: string } }[];
}

export async function promptGPTChat(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  dialog: ResultDialog
) {
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: "system", content: prompt }],
      model: model,
      temperature: 0.7,
      max_tokens: maxTokens,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stream: true,
    }),
  };

  const response = await fetch(url, requestOptions);
  const reader = response.body
    ?.pipeThrough(new TextDecoderStream())
    .getReader();
  let content = "";
  let gotDoneMessage = false;
  while (true) {
    const res = await reader?.read();
    if (res?.done) break;
    if (!res?.value) continue;
    const text = res?.value;
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    for (const line of lines) {
      const lineMessage = line.replace(/^data: /, "");
      if (lineMessage === "[DONE]") {
        gotDoneMessage = true;
        break;
      }
      try {
        const parsed = JSON.parse(lineMessage);
        const token = parsed.choices[0].delta.content;
        if (token) {
          dialog.addContent(token);
          content += token;
        }
      } catch (error) {
        console.error(`Could not JSON parse stream message`, {
          text,
          lines,
          line,
          lineMessage,
          error,
        });
      }
    }
  }
  return content;
}
