/// <reference types="jest" />
// Transcription audio (21/10/2026) : le chat envoie des morceaux WAV 16 kHz ;
// Gemini (compatible OpenAI) reçoit l'audio en `input_audio`.
import { AudioTranscriptionService, assemblyAiText, audioFormat } from './audio-transcription.service';
import { AiModelRouterService } from './ai-model-router.service';

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

describe('AudioTranscriptionService — AssemblyAI', () => {
  const fetchMock = jest.fn();
  const runtime = { base_url: 'https://api.assemblyai.com', api_key: 'aai', model: 'universal-3-5-pro', provider: 'assemblyai', label: 'assemblyai/universal-3-5-pro' };
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    delete process.env.AI_ASR_LANGUAGE;
  });

  function service() {
    const router = { getTranscriptionRuntime: jest.fn(() => runtime), reportUsage: jest.fn() };
    const instance = new AudioTranscriptionService(router as any);
    instance.pollMs = 0;
    return { router, instance };
  }

  it('envoie le fichier, crée la transcription en français, la suit puis l’efface', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { upload_url: 'https://cdn.assemblyai.com/upload/u1' }))
      .mockResolvedValueOnce(reply(200, { id: 't1', status: 'queued' }))
      .mockResolvedValueOnce(reply(200, { id: 't1', status: 'processing' }))
      .mockResolvedValueOnce(reply(200, {
        id: 't1', status: 'completed', audio_duration: 12.4, speech_model_used: 'universal-3-5-pro', text: 'Bonjour maître. Bonjour.',
        utterances: [{ speaker: 'A', text: 'Bonjour maître.' }, { speaker: 'B', text: 'Bonjour.' }, { speaker: 'A', text: 'Le loyer est impayé.' }],
      }))
      .mockResolvedValueOnce(reply(200, { id: 't1', status: 'deleted' }));
    const { instance, router } = service();

    const result = await instance.transcribe(wav);

    const [uploadUrl, upload] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe('https://api.assemblyai.com/v2/upload');
    expect(upload.headers.authorization).toBe('aai');
    expect(Buffer.from(upload.body).equals(wav.buffer)).toBe(true);
    const [createUrl, create] = fetchMock.mock.calls[1];
    expect(createUrl).toBe('https://api.assemblyai.com/v2/transcript');
    expect(JSON.parse(create.body)).toEqual({
      audio_url: 'https://cdn.assemblyai.com/upload/u1',
      speech_models: ['universal-3-5-pro', 'universal-2'],
      language_code: 'fr',
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    });
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.assemblyai.com/v2/transcript/t1');
    expect(fetchMock.mock.calls[4][0]).toBe('https://api.assemblyai.com/v2/transcript/t1');
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
    expect(result).toEqual({
      text: 'Intervenant 1 : Bonjour maître.\n\nIntervenant 2 : Bonjour.\n\nIntervenant 1 : Le loyer est impayé.',
      model: 'assemblyai/universal-3-5-pro',
    });
    // Facturé à la seconde : la durée compte en jetons d'entrée.
    expect(router.reportUsage).toHaveBeenCalledWith(
      { provider: 'assemblyai', model: 'universal-3-5-pro', profile: 'asr' },
      { input: 12, output: 0 },
      expect.any(Object),
    );
  });

  it('« auto » : détection de la langue au lieu du français', async () => {
    process.env.AI_ASR_LANGUAGE = 'auto';
    fetchMock
      .mockResolvedValueOnce(reply(200, { upload_url: 'u' }))
      .mockResolvedValueOnce(reply(200, { id: 't2', status: 'completed', text: 'Hello.' }))
      .mockResolvedValue(reply(200, {}));
    await expect(service().instance.transcribe(wav)).resolves.toMatchObject({ text: 'Hello.' });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.language_detection).toBe(true);
    expect(body).not.toHaveProperty('language_code');
  });

  it('transcription en erreur : message lisible, et effacement quand même', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { upload_url: 'u' }))
      .mockResolvedValueOnce(reply(200, { id: 't3', status: 'queued' }))
      .mockResolvedValueOnce(reply(200, { id: 't3', status: 'error', error: 'File does not appear to contain audio.' }))
      .mockResolvedValue(reply(200, {}));
    await expect(service().instance.transcribe(wav)).rejects.toThrow(/does not appear to contain audio/);
    expect(fetchMock.mock.calls.at(-1)?.[1].method).toBe('DELETE');
  });

  it('clé refusée ou crédit épuisé : message pour l’administrateur', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Invalid API key' }));
    await expect(service().instance.transcribe(wav)).rejects.toThrow(/clé AssemblyAI/);
    fetchMock.mockResolvedValueOnce(reply(200, { upload_url: 'u' })).mockResolvedValueOnce(reply(400, { error: 'Your balance is insufficient.' }));
    await expect(service().instance.transcribe(wav)).rejects.toThrow(/n’a plus de crédit/);
  });

  it('une seule voix : texte sans intervenants', () => {
    expect(assemblyAiText({ text: 'Bonjour.', utterances: [{ speaker: 'A', text: 'Bonjour.' }] })).toBe('Bonjour.');
  });
});

describe('Choix du moteur de transcription', () => {
  const keys = ['ASSEMBLYAI_API_KEY', 'ASSEMBLYAI_BASE_URL', 'AI_ASR_PROVIDER', 'AI_ASR_MODEL', 'AI_ASR_BASE_URL', 'AI_ASR_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_BASE_URL'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((key) => { saved[key] = process.env[key]; delete process.env[key]; }));
  afterEach(() => keys.forEach((key) => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }));

  it('AssemblyAI dès que sa clé est là, avant Gemini', () => {
    process.env.ASSEMBLYAI_API_KEY = 'aai';
    process.env.GOOGLE_API_KEY = 'g';
    expect(new AiModelRouterService().getTranscriptionRuntime()).toMatchObject({
      provider: 'assemblyai', base_url: 'https://api.assemblyai.com', api_key: 'aai', model: 'universal-3-5-pro', label: 'assemblyai/universal-3-5-pro',
    });
    process.env.ASSEMBLYAI_BASE_URL = 'https://api.eu.assemblyai.com';
    expect(new AiModelRouterService().getTranscriptionRuntime()?.base_url).toBe('https://api.eu.assemblyai.com');
  });

  it('AI_ASR_PROVIDER=google garde Gemini malgré la clé AssemblyAI', () => {
    process.env.ASSEMBLYAI_API_KEY = 'aai';
    process.env.GOOGLE_API_KEY = 'g';
    process.env.AI_ASR_PROVIDER = 'google';
    expect(new AiModelRouterService().getTranscriptionRuntime()).toMatchObject({ provider: 'google', model: 'gemini-2.5-flash' });
  });

  it('sans clé AssemblyAI : Gemini comme avant', () => {
    process.env.GOOGLE_API_KEY = 'g';
    expect(new AiModelRouterService().getTranscriptionRuntime()).toMatchObject({ provider: 'google' });
  });
});
