import { ResultDialog } from "./ui/result_dialog";

export async function promptGPTChat(
  systemPrompt: string,
  userContent: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  maxTokens: number,
  dialog: ResultDialog
) {
  try {
    // Validate API Key
    if (!apiKey || apiKey.trim() === "") {
      dialog.addContent("[AI-SUMMARY] Error: OpenAI API Key not set. Please configure API Key in plugin settings.");
      return "";
    }

    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        model: model,
        temperature: 0.7,
        max_tokens: maxTokens,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: true,
      }),
    };

    const url = `${baseUrl}/chat/completions`;
    const response = await fetch(url, requestOptions);

    // Check response status
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Request failed (${response.status}): ${response.statusText}`;

      if (response.status === 401) {
        errorMessage = "[AI-SUMMARY] Error: API Key is invalid or expired. Please check your API Key configuration.";
      } else if (response.status === 429) {
        errorMessage = "[AI-SUMMARY] Error: API request rate limit exceeded, please try again later.";
      } else if (response.status === 400) {
        errorMessage = "[AI-SUMMARY] Error: Invalid request parameters. Please check model name and other settings.";
      } else if (errorText) {
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = `[AI-SUMMARY] Error: ${errorData.error?.message || errorText}`;
        } catch {
          errorMessage = `[AI-SUMMARY] Error: ${errorText}`;
        }
      }

      dialog.addContent(errorMessage);
      return "";
    }

    const reader = response.body
      ?.pipeThrough(new TextDecoderStream())
      .getReader();

    if (!reader) {
      dialog.addContent("[AI-SUMMARY] Error: Unable to read response data stream.");
      return "";
    }

    let content = "";
    let hasError = false;

    while (true) {
      try {
        const res = await reader.read();
        if (res.done) break;
        if (!res.value) continue;

        const text = res.value;
        const lines = text.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          const lineMessage = line.replace(/^data: /, "");
          if (lineMessage === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(lineMessage);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              dialog.addContent(token);
              content += token;
            }
          } catch (parseError) {
            // Ignore stream response parsing errors but don't interrupt the entire flow
            console.warn(`[AI-SUMMARY] Stream response parsing warning: ${parseError.message}`);
          }
        }
      } catch (streamError) {
        hasError = true;
        console.error("[AI-SUMMARY] Stream processing error:", streamError);
        dialog.addContent(`[AI-SUMMARY] Error: Stream data processing failed - ${streamError.message}`);
        break;
      }
    }

    if (hasError) {
      return "";
    }

    return content;
  } catch (error) {
    console.error("[AI-SUMMARY] API request failed:", error);
    let errorMessage = "[AI-SUMMARY] Error: Network request failed";

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = "[AI-SUMMARY] Error: Network connection failed, please check network connection or Base URL settings";
    } else if (error.message) {
      errorMessage = `[AI-SUMMARY] Error: ${error.message}`;
    }

    dialog.addContent(errorMessage);
    return "";
  }
}
