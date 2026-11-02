import { readAgentModelStream } from './model.service';

function response(text: string, width = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += width) controller.enqueue(bytes.slice(i, i + width)); controller.close(); } }));
}
const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\r\n\r\n`;

describe('Agent model stream boundaries', () => {
  it('keeps multibyte text intact across arbitrary chunks and ignores reasoning fields', async () => {
    const chunks: string[] = [];
    const result = await readAgentModelStream(response(`: ping\n\ndata: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\n\n${delta('无人车')}${delta('查询完成')}data: [DONE]\n\n`, 1), text => chunks.push(text));
    expect(result).toBe('无人车查询完成'); expect(chunks).toEqual(['无人车', '查询完成']);
  });
  it('requires an explicit completion marker', async () => { await expect(readAgentModelStream(response(delta('部分回答')), () => undefined)).rejects.toThrow('未完整返回'); });
  it('rejects empty responses', async () => { await expect(readAgentModelStream(response('data: [DONE]\n\n'), () => undefined)).rejects.toThrow('未完整返回'); });
  it('does not expose upstream error details', async () => { await expect(readAgentModelStream(response('data: {"error":{"message":"provider-private-debug"}}\n\n'), () => undefined)).rejects.toThrow('智能分析服务暂不可用'); });
  it('does not include a malformed upstream payload in the error', async () => { await expect(readAgentModelStream(response('data: private-upstream-debug\n\n'), () => undefined)).rejects.toThrow('响应格式异常'); });
  it('limits the answer size', async () => { await expect(readAgentModelStream(response(delta('a'.repeat(16001)), 20000), () => undefined)).rejects.toThrow('长度限制'); });
});
