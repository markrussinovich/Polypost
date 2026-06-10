import { describe, expect, it } from 'vitest';

import { sanitizePastedHTML } from './pastedHtml';

describe('sanitizePastedHTML', () => {
  it('removes Word and unsafe paste noise while preserving semantic content', () => {
    const html = `
      <!--[if gte mso 9]><xml>noise</xml><![endif]-->
      <p class="MsoNormal" style="margin:0"><span style="font-weight:700;font-style:italic;text-decoration: underline">Important</span></p>
      <style>.MsoNormal { color: red; }</style>
      <script>alert('x')</script>
      <img src="tracking.gif">
    `;

    expect(sanitizePastedHTML(html)).toContain('<strong><em><u>Important</u></em></strong>');
    expect(sanitizePastedHTML(html)).not.toContain('MsoNormal');
    expect(sanitizePastedHTML(html)).not.toContain('<style>');
    expect(sanitizePastedHTML(html)).not.toContain('<script>');
    expect(sanitizePastedHTML(html)).not.toContain('<img');
  });

  it('converts Word list paragraphs into semantic lists', () => {
    const html = `
      <p class="MsoNormal">Intro</p>
      <p class="MsoListParagraphCxSpFirst" style="margin-left:.5in;text-indent:-.25in;mso-list:l0 level1 lfo1">
        <span style="mso-list:Ignore">·<span style="font:7.0pt Times New Roman">&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
        <b>Aeneas - Verified post-quantum cryptography:</b> SymCrypt details
      </p>
      <p class="MsoListParagraphCxSpLast" style="margin-left:.5in;text-indent:-.25in;mso-list:l0 level1 lfo1">
        <span style="mso-list:Ignore">·<span style="font:7.0pt Times New Roman">&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
        <b>DeepTest:</b> DeepTest details
      </p>
    `;

    const sanitized = sanitizePastedHTML(html);

    expect(sanitized).toContain('<ul>');
    expect(sanitized).toContain('<li>');
    expect(sanitized.match(/<ul>/g)).toHaveLength(1);
    expect(sanitized).toContain('<b>Aeneas - Verified post-quantum cryptography:</b> SymCrypt details');
    expect(sanitized).toContain('<b>DeepTest:</b> DeepTest details');
    expect(sanitized).not.toContain('MsoListParagraph');
    expect(sanitized).not.toContain('mso-list');
    expect(sanitized).not.toContain('·');
  });

  it('drops Word empty spacer paragraphs and Office o:p tags', () => {
    const html = [
      '<p class="MsoNormal">First paragraph.<o:p></o:p></p>',
      '<p class="MsoNormal"><o:p>&nbsp;</o:p></p>',
      '<p class="MsoNormal">Second paragraph.<o:p></o:p></p>',
      '<p class="MsoNormal" style="margin:0in"><o:p>&nbsp;</o:p></p>',
      '<p class="MsoNormal">Third.<o:p></o:p></p>',
    ].join('');

    const sanitized = sanitizePastedHTML(html);

    expect(sanitized).not.toContain('<o:p>');
    expect(sanitized).not.toContain('&nbsp;');
    expect(sanitized.match(/<p>/g)).toHaveLength(3);
    expect(sanitized).toContain('<p>First paragraph.</p>');
    expect(sanitized).toContain('<p>Second paragraph.</p>');
    expect(sanitized).toContain('<p>Third.</p>');
  });

  it('trims whitespace from the Word <html>/<body> wrapper', () => {
    const html = '<html>\r\n<body>\r\n<!--StartFragment--><p class="MsoNormal">Only line.<o:p></o:p></p><!--EndFragment-->\r\n</body>\r\n</html>';

    const sanitized = sanitizePastedHTML(html);

    expect(sanitized).toBe('<p>Only line.</p>');
  });

  it('removes paragraphs that hold only whitespace or line breaks', () => {
    const html = '<p>Real line.</p><p><br></p><p>&nbsp;</p><p>   </p><p>Another line.</p>';

    const sanitized = sanitizePastedHTML(html);

    expect(sanitized.match(/<p>/g)).toHaveLength(2);
    expect(sanitized).toContain('<p>Real line.</p>');
    expect(sanitized).toContain('<p>Another line.</p>');
  });

  it('converts ordered Word list paragraphs into semantic ordered lists', () => {
    const html = `
      <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2">1. First</p>
      <p class="MsoListParagraph" style="mso-list:l1 level1 lfo2">2. Second</p>
    `;

    const sanitized = sanitizePastedHTML(html);

    expect(sanitized).toContain('<ol>');
    expect(sanitized).toContain('<li>First</li>');
    expect(sanitized).toContain('<li>Second</li>');
  });
});