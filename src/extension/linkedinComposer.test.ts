import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attachFilesToLinkedInComposer,
  closeNativeLinkedInComposer,
  dismissNativeComposerDiscardConfirmation,
  findComposerMentionEntity,
  findLinkedInComposer,
  findLinkedInLinkPreview,
  findLinkedInMediaAttachedIndicator,
  findLinkedInMediaFileInput,
  findLinkedInMediaNextButton,
  findLinkedInPostButton,
  findMentionTypeaheadOption,
  findNativeComposerDialog,
  findStartPostControlFrom,
  getLinkedInComposerAnchor,
  isStartPostControl,
  setLinkedInComposerSegments,
  setLinkedInComposerText,
} from './linkedinComposer';

function mockVisible(element: HTMLElement) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: 160,
    height: 120,
    left: 0,
    right: 480,
    top: 40,
    width: 480,
    x: 0,
    y: 40,
    toJSON: () => ({}),
  });
}

// jsdom does not implement DataTransfer, so media tests stub a minimal version.
function stubDataTransfer() {
  class FakeDataTransfer {
    private fileList: File[] = [];

    items = {
      add: (file: File) => {
        this.fileList.push(file);
      },
    };

    get files() {
      return this.fileList as unknown as FileList;
    }
  }

  vi.stubGlobal('DataTransfer', FakeDataTransfer);
}

describe('start-post trigger detection', () => {
  it('matches the old button semantic (text, possibly with an icon)', () => {
    document.body.innerHTML = `
      <button class="artdeco-button">
        <svg class="icon"></svg>
        <span>Start a post</span>
      </button>
    `;
    const button = document.querySelector('button')!;
    expect(isStartPostControl(button)).toBe(true);
  });

  it('matches the old role="button" semantic', () => {
    document.body.innerHTML = `<div role="button">Start a post</div>`;
    expect(isStartPostControl(document.querySelector('[role="button"]')!)).toBe(true);
  });

  it('matches the new aria-label semantic with no button role', () => {
    document.body.innerHTML = `
      <a tabindex="0">
        <div aria-label="Start a post"><p>Start a post</p></div>
      </a>
    `;
    const labelled = document.querySelector('[aria-label="Start a post"]')!;
    expect(isStartPostControl(labelled as HTMLElement)).toBe(true);
  });

  it('does not match a large container that merely contains the trigger text', () => {
    document.body.innerHTML = `
      <section aria-label="Primary content">
        <a tabindex="0"><div aria-label="Start a post"><p>Start a post</p></div></a>
        <div>Lots of other feed content here.</div>
      </section>
    `;
    const section = document.querySelector('section')!;
    expect(isStartPostControl(section)).toBe(false);
  });

  it('finds the trigger when the click lands inside the new (labelled) semantic', () => {
    document.body.innerHTML = `
      <a tabindex="0">
        <div aria-label="Start a post"><p id="inner">Start a post</p></div>
      </a>
    `;
    const found = findStartPostControlFrom(document.getElementById('inner'));
    // The exact node returned does not matter — the handler only uses it as a
    // truthy gate — but it must sit within the trigger.
    expect(found).not.toBeNull();
    expect(found!.closest('a[tabindex]')).not.toBeNull();
  });

  it('finds the trigger when the click lands inside the old (button) semantic', () => {
    document.body.innerHTML = `
      <button><span id="inner">Start a post</span></button>
    `;
    const found = findStartPostControlFrom(document.getElementById('inner'));
    expect(found).not.toBeNull();
    expect(found!.closest('button')).not.toBeNull();
  });

  it('returns null when the click is unrelated to the trigger', () => {
    document.body.innerHTML = `<button id="like">Like</button>`;
    expect(findStartPostControlFrom(document.getElementById('like'))).toBeNull();
  });
});

describe('linkedinComposer helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('finds a visible LinkedIn modal composer', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div class="ql-container">
          <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        </div>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('.ql-editor');
    expect(editor).not.toBeNull();
    mockVisible(editor!);

    expect(findLinkedInComposer()).toBe(editor);
    expect(getLinkedInComposerAnchor(editor!)).toBe(document.querySelector('.ql-container'));
  });

  it('ignores hidden composer candidates', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
      </div>
    `;

    expect(findLinkedInComposer()).toBeNull();
  });

  it('finds a visible composer by placeholder text outside a dialog', () => {
    document.body.innerHTML = `
      <div class="share-box">
        <div contenteditable="true">What do you want to talk about?</div>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    mockVisible(editor!);

    expect(findLinkedInComposer()).toBe(editor);
  });

  it('finds a native composer dialog even when the editor candidate is hidden', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <button type="button" aria-label="Dismiss"></button>
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <button type="button">Post</button>
      </div>
    `;

    expect(findLinkedInComposer()).toBeNull();
    expect(findNativeComposerDialog()).toBe(document.querySelector('[role="dialog"]'));
  });

  it('clicks the native composer dismiss control without closing the formatter dialog', () => {
    document.body.innerHTML = `
      <div id="linkedin-post-formatter-extension-root">
        <section role="dialog" aria-label="LinkedIn Post Formatter">
          <button type="button" aria-label="Close formatter"></button>
        </section>
      </div>
      <div role="dialog">
        <button type="button" aria-label="Dismiss"></button>
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <button type="button">Post</button>
      </div>
    `;
    const formatterClose = document.querySelector<HTMLButtonElement>('#linkedin-post-formatter-extension-root button');
    const nativeClose = document.querySelector<HTMLButtonElement>('body > [role="dialog"] button[aria-label="Dismiss"]');
    const formatterHandler = vi.fn();
    const nativeHandler = vi.fn();
    formatterClose?.addEventListener('click', formatterHandler);
    nativeClose?.addEventListener('click', nativeHandler);

    expect(closeNativeLinkedInComposer()).toBe(true);

    expect(nativeHandler).toHaveBeenCalledTimes(1);
    expect(formatterHandler).not.toHaveBeenCalled();
  });

  it('clicks discard confirmations rendered with role="alertdialog"', () => {
    // LinkedIn's "Discard draft" prompt uses alertdialog, not dialog.
    document.body.innerHTML = `
      <div role="alertdialog">
        <p>Discard draft</p>
        <button type="button">Go back</button>
        <button type="button">Discard</button>
      </div>
    `;
    const discardButton = document.querySelectorAll<HTMLButtonElement>('button')[1];
    const discardHandler = vi.fn();
    discardButton.addEventListener('click', discardHandler);

    expect(dismissNativeComposerDiscardConfirmation()).toBe(true);

    expect(discardHandler).toHaveBeenCalledTimes(1);
  });

  it('finds the typeahead option whose hit text matches the mention name', () => {
    document.body.innerHTML = `
      <div class="editor-typeahead__typeahead-tray" role="listbox">
        <div role="option"><span class="search-typeahead-v2__hit-text">Scott Hansen</span></div>
        <div role="option"><span class="search-typeahead-v2__hit-text"> Scott  Hanselman </span></div>
      </div>
    `;
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    options.forEach(mockVisible);

    expect(findMentionTypeaheadOption('scott hanselman')).toBe(options[1]);
    expect(findMentionTypeaheadOption('jane doe')).toBeNull();
  });

  it('ignores typeahead options inside the extension root or outside a typeahead surface', () => {
    document.body.innerHTML = `
      <div id="linkedin-post-formatter-extension-root">
        <div class="editor-typeahead__typeahead-tray">
          <div role="option"><span class="search-typeahead-v2__hit-text">Scott Hanselman</span></div>
        </div>
      </div>
      <ul><li role="option">Scott Hanselman</li></ul>
    `;
    document.querySelectorAll<HTMLElement>('[role="option"]').forEach(mockVisible);

    expect(findMentionTypeaheadOption('scott hanselman')).toBeNull();
  });

  it('finds the mention entity LinkedIn inserts into the composer', () => {
    document.body.innerHTML = `
      <div contenteditable="true">
        <p>Hello <a class="ql-mention" href="#" data-entity-urn="urn:li:fsd_profile:abc">Scott Hanselman</a>!</p>
      </div>
    `;
    const composer = document.querySelector<HTMLElement>('[contenteditable="true"]')!;

    expect(findComposerMentionEntity(composer, 'Scott Hanselman')).toBe(composer.querySelector('a'));
    expect(findComposerMentionEntity(composer, 'Jane Doe')).toBeNull();
  });

  it('inserts text segments and reports mentions that could not resolve', async () => {
    // jsdom has no execCommand, so the text path uses the fallback and the
    // mention typeahead path reports failure instead of applying.
    document.body.innerHTML = '<div contenteditable="true"></div>';
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!;

    const result = await setLinkedInComposerSegments(editor, [
      { kind: 'text', text: 'Hello ' },
      { kind: 'mention', name: 'Scott Hanselman' },
      { kind: 'text', text: '!' },
    ]);

    expect(result).toEqual({ inserted: true, mentionsRequested: 1, mentionsApplied: 0 });
    expect(editor.textContent).toBe('Hello !');
  });

  it('clicks LinkedIn discard confirmations after closing a draft composer', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <p>Discard post?</p>
        <button type="button">Cancel</button>
        <button type="button">Discard</button>
      </div>
    `;
    const discardButton = document.querySelectorAll<HTMLButtonElement>('button')[1];
    const discardHandler = vi.fn();
    discardButton.addEventListener('click', discardHandler);

    expect(dismissNativeComposerDiscardConfirmation()).toBe(true);

    expect(discardHandler).toHaveBeenCalledTimes(1);
  });

  it('finds the composer inside a shadow root', () => {
    document.body.innerHTML = '<div id="interop-outlet"></div>';
    const host = document.querySelector<HTMLElement>('#interop-outlet');
    const shadow = host!.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div role="dialog" class="share-box-v2__modal">
        <div class="ql-container">
          <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        </div>
        <button type="button" class="share-actions__primary-action">Post</button>
      </div>
    `;
    const editor = shadow.querySelector<HTMLElement>('.ql-editor');
    expect(editor).not.toBeNull();
    mockVisible(editor!);

    expect(findLinkedInComposer()).toBe(editor);
    expect(findNativeComposerDialog()).toBe(shadow.querySelector('[role="dialog"]'));
  });

  it('finds the enabled native Post button inside a shadow root and skips the extension button', () => {
    document.body.innerHTML = `
      <div id="linkedin-post-formatter-extension-root">
        <button type="button">Post</button>
      </div>
      <div id="interop-outlet"></div>
    `;
    const host = document.querySelector<HTMLElement>('#interop-outlet');
    const shadow = host!.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <button type="button" class="share-actions__primary-action" disabled>Post</button>
      </div>
    `;
    const editor = shadow.querySelector<HTMLElement>('.ql-editor');
    mockVisible(editor!);
    const nativePost = shadow.querySelector<HTMLButtonElement>('.share-actions__primary-action');

    expect(findLinkedInPostButton()).toBeNull();

    nativePost!.disabled = false;

    expect(findLinkedInPostButton()).toBe(nativePost);
  });

  it('prefers the media file input inside the composer dialog and skips the extension root', () => {
    document.body.innerHTML = `
      <div id="linkedin-post-formatter-extension-root">
        <input type="file" accept="image/*,video/*" />
      </div>
      <input type="file" accept="image/*" id="stray-input" />
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <input type="file" accept="image/*,video/*" id="dialog-input" />
        <button type="button">Post</button>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('.ql-editor');
    mockVisible(editor!);

    expect(findLinkedInMediaFileInput()).toBe(document.querySelector('#dialog-input'));
  });

  it('ignores file inputs that only accept non-media types', () => {
    document.body.innerHTML = '<input type="file" accept=".pdf,.doc" />';

    expect(findLinkedInMediaFileInput()).toBeNull();
  });

  it('attaches files through the media input and dispatches a change event', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <input type="file" accept="image/*,video/*" />
        <button type="button">Post</button>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('.ql-editor');
    mockVisible(editor!);
    stubDataTransfer();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const changeHandler = vi.fn();
    input!.addEventListener('change', changeHandler);

    const file = new File(['pixels'], 'photo.png', { type: 'image/png' });

    expect(attachFilesToLinkedInComposer([file])).toBe(true);

    expect(changeHandler).toHaveBeenCalledTimes(1);
    expect(input!.files).toHaveLength(1);
    expect(input!.files![0].name).toBe('photo.png');
  });

  it('falls back to a simulated drop on the composer when no file input exists', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('.ql-editor');
    mockVisible(editor!);
    stubDataTransfer();
    const droppedFiles: File[] = [];
    editor!.addEventListener('drop', (event) => {
      const transfer = (event as DragEvent).dataTransfer;
      droppedFiles.push(...Array.from(transfer?.files ?? []));
    });

    const file = new File(['frames'], 'clip.mp4', { type: 'video/mp4' });

    expect(attachFilesToLinkedInComposer([file])).toBe(true);

    expect(droppedFiles).toHaveLength(1);
    expect(droppedFiles[0].name).toBe('clip.mp4');
  });

  it('finds the enabled media editor Next button and skips disabled or extension buttons', () => {
    document.body.innerHTML = `
      <div id="linkedin-post-formatter-extension-root">
        <div role="dialog"><button type="button">Next</button></div>
      </div>
      <div role="dialog" id="media-editor">
        <button type="button" disabled>Next</button>
      </div>
    `;
    mockVisible(document.querySelector<HTMLElement>('#media-editor')!);

    expect(findLinkedInMediaNextButton()).toBeNull();

    const nativeNext = document.querySelector<HTMLButtonElement>('#media-editor button');
    nativeNext!.disabled = false;

    expect(findLinkedInMediaNextButton()).toBe(nativeNext);
  });

  it('ignores Done buttons inside hidden or video.js dialogs', () => {
    document.body.innerHTML = `
      <div role="dialog" class="vjs-modal-dialog vjs-text-track-settings" id="vjs-dialog">
        <button type="button">Done</button>
      </div>
      <div role="dialog" id="hidden-dialog">
        <button type="button">Next</button>
      </div>
    `;
    // The vjs dialog is "visible" but carries video.js classes; the other
    // dialog has no layout box (jsdom default zero rect).
    mockVisible(document.querySelector<HTMLElement>('#vjs-dialog')!);

    expect(findLinkedInMediaNextButton()).toBeNull();
  });

  it('detects the link preview card inside the composer dialog', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <button type="button">Post</button>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('.ql-editor');
    mockVisible(editor!);

    expect(findLinkedInLinkPreview()).toBeNull();

    const preview = document.createElement('div');
    preview.className = 'share-creation-state__preview-container';
    document.querySelector('[role="dialog"]')!.append(preview);

    expect(findLinkedInLinkPreview()).toBeNull();

    mockVisible(preview);

    expect(findLinkedInLinkPreview()).toBe(preview);
  });

  it('detects the inline media-attached indicator in the composer dialog', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <div class="ql-editor" contenteditable="true" data-placeholder="What do you want to talk about?"></div>
        <button type="button">Post</button>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>('.ql-editor');
    mockVisible(editor!);

    expect(findLinkedInMediaAttachedIndicator()).toBeNull();

    const removeMedia = document.createElement('button');
    removeMedia.type = 'button';
    removeMedia.textContent = 'Remove media';
    document.querySelector('[role="dialog"]')!.append(removeMedia);

    expect(findLinkedInMediaAttachedIndicator()).toBe(removeMedia);
  });

  it('writes text and dispatches input and change events', () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    editor!.addEventListener('input', inputHandler);
    editor!.addEventListener('change', changeHandler);

    expect(setLinkedInComposerText(editor!, 'Hello\nLinkedIn')).toBe(true);

    expect(editor!.textContent).toBe('Hello\nLinkedIn');
    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);
  });
});