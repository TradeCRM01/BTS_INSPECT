import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyShareText } from './documentShareDeliver';

const PORTAL_URL = 'https://grafter.com.au/p?t=abc';

class FakeClipboardItem {
  constructor(readonly parts: Record<string, Promise<Blob>>) {}
}

// Awaits the promised blobs the way a browser does, so a rejected text rejects the write.
function browserLikeWrite(sink: FakeClipboardItem[]) {
  return vi.fn(async (items: FakeClipboardItem[]) => {
    for (const item of items) await Promise.all(Object.values(item.parts));
    sink.push(...items);
  });
}

class FakeTextarea {
  value = '';
  readOnly = false;
  style = { cssText: '' };
  selected = false;
  parent: FakeBody | null = null;
  select() {
    this.selected = true;
  }
  remove() {
    this.parent?.detach(this);
  }
}

class FakeBody {
  children: FakeTextarea[] = [];
  appendChild(el: FakeTextarea) {
    this.children.push(el);
    el.parent = this;
    return el;
  }
  detach(el: FakeTextarea) {
    this.children = this.children.filter(c => c !== el);
    el.parent = null;
  }
}

function stubLegacyDocument(copyOk: boolean) {
  const body = new FakeBody();
  const copied: string[] = [];
  vi.stubGlobal('document', {
    body,
    createElement: (tag: string) => {
      if (tag !== 'textarea') throw new Error(`unexpected element ${tag}`);
      return new FakeTextarea();
    },
    execCommand: (cmd: string) => {
      if (cmd !== 'copy') return false;
      copied.push(...body.children.filter(c => c.selected && c.readOnly).map(c => c.value));
      return copyOk;
    },
  });
  return { body, copied };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyShareText', () => {
  it('starts the clipboard write inside the tap and fills it from the promised text', async () => {
    const written: FakeClipboardItem[] = [];
    const write = browserLikeWrite(written);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    let release!: (url: string) => void;
    const resolveText = vi.fn(() => new Promise<string>(r => { release = r; }));

    const pending = copyShareText(resolveText);
    expect(write).toHaveBeenCalledTimes(1);
    release(PORTAL_URL);

    await expect(pending).resolves.toEqual({ kind: 'copied' });
    expect(resolveText).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    const blob = await written[0].parts['text/plain'];
    expect(blob.type).toBe('text/plain');
    expect(await blob.text()).toBe(PORTAL_URL);
  });

  it('falls back to writeText when the item write is refused', async () => {
    const write = vi.fn(async () => {
      throw Object.assign(
        new Error('The request is not allowed by the user agent.'),
        { name: 'NotAllowedError' },
      );
    });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);

    await expect(copyShareText(async () => PORTAL_URL)).resolves.toEqual({ kind: 'copied' });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(PORTAL_URL);
  });

  it('copies through execCommand when the origin has no clipboard API', async () => {
    vi.stubGlobal('navigator', {});
    const { body, copied } = stubLegacyDocument(true);

    await expect(copyShareText(async () => PORTAL_URL)).resolves.toEqual({ kind: 'copied' });
    expect(copied).toEqual([PORTAL_URL]);
    expect(body.children).toEqual([]);
  });

  it('hands the trimmed text back for a manual copy when execCommand refuses', async () => {
    vi.stubGlobal('navigator', {});
    const { body } = stubLegacyDocument(false);

    await expect(copyShareText(async () => ` ${PORTAL_URL} `)).resolves.toEqual({
      kind: 'manual',
      text: PORTAL_URL,
    });
    expect(body.children).toEqual([]);
  });

  it('rethrows a failed text lookup instead of offering a manual copy', async () => {
    const write = browserLikeWrite([]);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);

    await expect(
      copyShareText(async () => { throw new Error('token insert failed'); }),
    ).rejects.toThrow('token insert failed');
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('refuses an empty text before anything reaches the clipboard', async () => {
    const written: FakeClipboardItem[] = [];
    const write = browserLikeWrite(written);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);

    await expect(copyShareText(async () => '   ')).rejects.toThrow('Nothing to copy.');
    expect(written).toEqual([]);
    expect(writeText).not.toHaveBeenCalled();
  });
});
