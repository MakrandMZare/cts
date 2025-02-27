export const description = `
createRenderBundleEncoder validation tests.
`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { range } from '../../../../common/util/util.js';
import { kMaxColorAttachments } from '../../../capability_info.js';
import {
  kAllTextureFormats,
  kDepthStencilFormats,
  kTextureFormatInfo,
  kRenderableColorTextureFormats,
} from '../../../format_info.js';
import { ValidationTest } from '../validation_test.js';

export const g = makeTestGroup(ValidationTest);

g.test('attachment_state,limits,maxColorAttachments')
  .desc(`Tests that attachment state must have <= device.limits.maxColorAttachments.`)
  .params(u =>
    u.beginSubcases().combine(
      'colorFormatCount',
      range(kMaxColorAttachments + 1, i => i + 1) // 1-9
    )
  )
  .fn(t => {
    const { colorFormatCount } = t.params;
    t.expectValidationError(() => {
      t.device.createRenderBundleEncoder({
        colorFormats: Array(colorFormatCount).fill('r8unorm'),
      });
    }, colorFormatCount > t.device.limits.maxColorAttachments);
  });

g.test('attachment_state,limits,maxColorAttachmentBytesPerSample,aligned')
  .desc(
    `
    Tests that the total color attachment bytes per sample <=
    device.limits.maxColorAttachmentBytesPerSample when using the same format (aligned) for multiple
    attachments.
    `
  )
  .params(u =>
    u
      .combine('format', kRenderableColorTextureFormats)
      .beginSubcases()
      .combine(
        'colorFormatCount',
        range(kMaxColorAttachments, i => i + 1)
      )
  )
  .fn(t => {
    const { format, colorFormatCount } = t.params;
    const info = kTextureFormatInfo[format];
    const shouldError =
      !info.colorRender ||
      info.colorRender.byteCost * colorFormatCount >
        t.device.limits.maxColorAttachmentBytesPerSample;

    t.expectValidationError(() => {
      t.device.createRenderBundleEncoder({
        colorFormats: Array(colorFormatCount).fill(format),
      });
    }, shouldError);
  });

g.test('attachment_state,limits,maxColorAttachmentBytesPerSample,unaligned')
  .desc(
    `
    Tests that the total color attachment bytes per sample <=
    device.limits.maxColorAttachmentBytesPerSample when using various sets of (potentially)
    unaligned formats.
    `
  )
  .params(u =>
    u.combineWithParams([
      // Alignment causes the first 1 byte R8Unorm to become 4 bytes. So even though
      // 1+4+8+16+1 < 32, the 4 byte alignment requirement of R32Float makes the first R8Unorm
      // become 4 and 4+4+8+16+1 > 32. Re-ordering this so the R8Unorm's are at the end, however
      // is allowed: 4+8+16+1+1 < 32.
      {
        formats: [
          'r8unorm',
          'r32float',
          'rgba8unorm',
          'rgba32float',
          'r8unorm',
        ] as GPUTextureFormat[],
        _shouldError: true,
      },
      {
        formats: [
          'r32float',
          'rgba8unorm',
          'rgba32float',
          'r8unorm',
          'r8unorm',
        ] as GPUTextureFormat[],
        _shouldError: false,
      },
    ])
  )
  .fn(t => {
    const { formats, _shouldError } = t.params;

    t.expectValidationError(() => {
      t.device.createRenderBundleEncoder({
        colorFormats: formats,
      });
    }, _shouldError);
  });

g.test('attachment_state,empty_color_formats')
  .desc(`Tests that if no colorFormats are given, a depthStencilFormat must be specified.`)
  .params(u =>
    u.beginSubcases().combine('depthStencilFormat', [undefined, 'depth24plus-stencil8'] as const)
  )
  .fn(t => {
    const { depthStencilFormat } = t.params;
    t.expectValidationError(() => {
      t.device.createRenderBundleEncoder({
        colorFormats: [],
        depthStencilFormat,
      });
    }, depthStencilFormat === undefined);
  });

g.test('valid_texture_formats')
  .desc(
    `
    Tests that createRenderBundleEncoder only accepts valid formats for its attachments.
      - colorFormats
      - depthStencilFormat
    `
  )
  .params(u =>
    u //
      .combine('format', kAllTextureFormats)
      .beginSubcases()
      .combine('attachment', ['color', 'depthStencil'])
  )
  .beforeAllSubcases(t => {
    const { format } = t.params;
    t.selectDeviceForTextureFormatOrSkipTestCase(format);
  })
  .fn(t => {
    const { format, attachment } = t.params;

    const colorRenderable = kTextureFormatInfo[format].colorRender;

    const depthStencil = kTextureFormatInfo[format].depth || kTextureFormatInfo[format].stencil;

    switch (attachment) {
      case 'color': {
        t.expectValidationError(() => {
          t.device.createRenderBundleEncoder({
            colorFormats: [format],
          });
        }, !colorRenderable);

        break;
      }
      case 'depthStencil': {
        t.expectValidationError(() => {
          t.device.createRenderBundleEncoder({
            colorFormats: [],
            depthStencilFormat: format,
          });
        }, !depthStencil);

        break;
      }
    }
  });

g.test('depth_stencil_readonly')
  .desc(
    `
    Tests that createRenderBundleEncoder validation of depthReadOnly and stencilReadOnly
      - With depth-only formats
      - With stencil-only formats
      - With depth-stencil-combined formats
    `
  )
  .params(u =>
    u //
      .combine('depthStencilFormat', kDepthStencilFormats)
      .beginSubcases()
      .combine('depthReadOnly', [false, true])
      .combine('stencilReadOnly', [false, true])
  )
  .beforeAllSubcases(t => {
    const { depthStencilFormat } = t.params;
    t.selectDeviceForTextureFormatOrSkipTestCase(depthStencilFormat);
  })
  .fn(t => {
    const { depthStencilFormat, depthReadOnly, stencilReadOnly } = t.params;

    let shouldError = false;
    if (
      kTextureFormatInfo[depthStencilFormat].depth &&
      kTextureFormatInfo[depthStencilFormat].stencil &&
      depthReadOnly !== stencilReadOnly
    ) {
      shouldError = true;
    }

    t.expectValidationError(() => {
      t.device.createRenderBundleEncoder({
        colorFormats: [],
        depthStencilFormat,
        depthReadOnly,
        stencilReadOnly,
      });
    }, shouldError);
  });

g.test('depth_stencil_readonly_with_undefined_depth')
  .desc(
    `
    Tests that createRenderBundleEncoder validation of depthReadOnly and stencilReadOnly is ignored
    if there is no depthStencilFormat set.
    `
  )
  .params(u =>
    u //
      .beginSubcases()
      .combine('depthReadOnly', [false, true])
      .combine('stencilReadOnly', [false, true])
  )
  .fn(t => {
    const { depthReadOnly, stencilReadOnly } = t.params;

    t.device.createRenderBundleEncoder({
      colorFormats: ['bgra8unorm'],
      depthReadOnly,
      stencilReadOnly,
    });
  });
