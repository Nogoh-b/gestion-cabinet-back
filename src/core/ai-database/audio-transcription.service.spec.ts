/// <reference types="jest" />
// Transcription audio (21/10/2026) : le chat envoie des morceaux WAV 16 kHz ;
// Gemini (compatible OpenAI) reçoit l'audio en `input_audio`.
import { AudioTranscriptionService, audioFormat } from './audio-transcription.service';

const wav = { buffer: Buffer.from('RIFF....WAVEfmt '), mimetype: 'audio/wav', originalname: 'enregistrement-1.wav' };

function setup(runtime: any = { base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/', api_key: 'k', model: 'gemini-2.5-flash', provider: 'google', label: 'google/gemini-2.5-flash' }) {
  const router = { getTranscriptionRuntime: jest.fn(() => runtime), reportUsage: jest.fn() };
  return { router, service: new AudioTranscriptionService(router as any) };
}

function reply(status: number, body: any) {
  return { ok: status < 400, status, json: async () => body } as any;
}

describe('AudioTranscriptionService', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('envoie le WAV en input_audio avec la consigne, et compte la consommation', async () => {
    fetchMock.mockResolvedValue(reply(200, { choices: [{ message: { content: ' Intervenant 1 : Bonjour Maître. ' } }], usage: { prompt_tokens: 900, completion_tokens: 12 } }));
    const { service, router } = setup();

    const result = await service.transcribe(wav, { part: 2, parts: 3, previous: 'Intervenant 2 : merci.' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gemini-2.5-flash');
    expect(body.reasoning_effort).toBe('none');
    expect(body.messages[0].content).toContain('Intervenant 1 :');
    expect(body.messages[0].content).toContain('partie 2 sur 3');
    expect(body.messages[0].content).toContain('Intervenant 2 : merci.');
    expect(body.messages[1].content[1]).toEqual({ type: 'input_audio', input_audio: { data: wav.buffer.toString('base64'), format: 'wav' } });
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(result).toEqual({ text: 'Intervenant 1 : Bonjour Maître.', model: 'google/gemini-2.5-flash' });
    expect(router.reportUsage).toHaveBeenCalledWith(
      { provider: 'google', model: 'gemini-2.5-flash', profile: 'asr' },
      { input: 900, output: 12 },
      expect.any(Object),
    );
  });

  it('réessaie sans reasoning_effort si le fournisseur le refuse', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(400, { error: { message: 'Unknown name "reasoning_effort"' } }))
      .mockResolvedValueOnce(reply(200, { choices: [{ message: { content: 'Bonjour' } }] }));
    const { service } = setup();
    await expect(service.transcribe(wav)).resolves.toMatchObject({ text: 'Bonjour' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('reasoning_effort');
  });

  it('MiMo ASR : l’audio seul, en data URL', async () => {
    fetchMock.mockResolvedValue(reply(200, { choices: [{ message: { content: 'hello' } }] }));
    const { service } = setup({ base_url: 'https://api.xiaomimimo.com/v1', api_key: 'm', model: 'mimo-v2.5-asr', provider: 'mimo', label: 'mimo/mimo-v2.5-asr' });
    await service.transcribe({ ...wav, mimetype: 'audio/mpeg', originalname: 'note.mp3' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/mpeg;base64,/);
    expect(body.asr_options).toEqual({ language: 'auto' });
  });

  it('refuse un format autre que WAV / MP3, ou sans moteur configuré', async () => {
    const { service } = setup();
    await expect(service.transcribe({ ...wav, mimetype: 'audio/webm', originalname: 'a.webm' })).rejects.toThrow(/WAV ou du MP3/);
    const none = setup(null).service;
    await expect(none.transcribe(wav)).rejects.toThrow(/pas configurée/);
    expect(none.engine()).toEqual({ available: false, label: null });
  });

  it('remonte une erreur lisible quand le modèle échoue', async () => {
    fetchMock.mockResolvedValue(reply(500, { error: { message: 'quota exceeded' } }));
    await expect(setup().service.transcribe(wav)).rejects.toThrow(/quota exceeded/);
  });

  // Vu le 22/10/2026 : « Your prepayment credits are depleted » (HTTP 402, erreur en tableau).
  it('crédits du fournisseur épuisés : message pour l’administrateur', async () => {
    fetchMock.mockResolvedValue(reply(402, [{ error: { code: 402, message: 'Your prepayment credits are depleted.', status: 'RESOURCE_EXHAUSTED' } }]));
    await expect(setup().service.transcribe(wav)).rejects.toThrow(/n’a plus de crédit/);
  });

  it('Whisper (OpenAI, Groq) : fichier en multipart sur audio/transcriptions', async () => {
    fetchMock.mockResolvedValue(reply(200, { text: ' Bonjour Maître. ' }));
    const { service } = setup({ base_url: 'https://api.groq.com/openai/v1', api_key: 'g', model: 'whisper-large-v3', provider: 'custom', label: 'custom/whisper-large-v3' });
    const result = await service.transcribe(wav, { previous: 'Intervenant 1 : merci.' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('language')).toBe('fr');
    expect(form.get('prompt')).toBe('Intervenant 1 : merci.');
    expect(result.text).toBe('Bonjour Maître.');
  });

  it('reconnaît les formats', () => {
    expect(audioFormat('audio/x-wav', 'a')).toBe('wav');
    expect(audioFormat('application/octet-stream', 'note.mp3')).toBe('mp3');
    expect(audioFormat('audio/ogg', 'a.ogg')).toBeNull();
  });
});
