export const TOC_ANCHOR_NAME = 'TOC_ANCHOR';

/**
 * Generates requests to initialize a new document with a Table of Contents structure.
 * @param {string} projectTitle The title of the project.
 * @returns {Array<Object>} An array of Google Docs API requests.
 */
export const initDocumentTemplate = (projectTitle, projectDescription = '') => {
  const requests = [
    
  ];
  let currentIndex = 1; // Start at the end of the initial empty paragraph

  // 1. Insert Project Title
  const titleText = `${projectTitle}\n`;
  requests.push({
    insertText: { text: titleText, location: { index: currentIndex } },
  });
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: currentIndex, endIndex: currentIndex + titleText.length - 1 },
      paragraphStyle: { namedStyleType: 'HEADING_1' },
      fields: 'namedStyleType',
    },
  });
  currentIndex += titleText.length;

  // 2. Insert Project Description (if provided)
  if (projectDescription) {
    const descriptionText = `${projectDescription}\n\n`; // Add extra newline for spacing
    requests.push({
      insertText: { text: descriptionText, location: { index: currentIndex } },
    });
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: currentIndex, endIndex: currentIndex + descriptionText.length - 1 },
        paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
        fields: 'namedStyleType',
      },
    });
    currentIndex += descriptionText.length;
  }

  

  


  return requests;
};

/**
 * Generates requests to create a new page with a short's content in a table,
 * including a bookmark for linking.
 * @param {Object} short The short object.
 * @param {number} insertionIndex The index in the document to start inserting.
 * @returns {Array<Object>} An array of Google Docs API requests.
 */
export const generateShortPageRequests = (short, insertionIndex) => {
  const bookmarkName = `short_bookmark_${short.id}`;
  const shortIdText = `SHORT_ID: ${short.id}`;
  const requests = [];
  let currentIndex = insertionIndex;

  // 1. Insert a page break to start on a new page
  requests.push({ insertPageBreak: { location: { index: Math.max(0, currentIndex - 1) } } });
  currentIndex++;

  // 2. Insert the hidden SHORT_ID and create a bookmark for it
  requests.push({ insertText: { text: `${shortIdText}\n`, location: { index: currentIndex } } });
  requests.push({
    createNamedRange: {
      name: bookmarkName,
      range: { startIndex: currentIndex, endIndex: currentIndex + shortIdText.length },
    },
  });
  requests.push({
    updateTextStyle: {
      range: { startIndex: currentIndex, endIndex: currentIndex + shortIdText.length },
      textStyle: {
        fontSize: { magnitude: 1, unit: 'PT' },
        foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
      },
      fields: 'fontSize,foregroundColor',
    },
  });
  currentIndex += shortIdText.length + 1;

  // 3. Insert a simple text horizontal rule for visual separation
  const ruleText = '--------------------\n';
  requests.push({ insertText: { text: ruleText, location: { index: currentIndex } } });
  currentIndex += ruleText.length;

  // 4. Insert the rest of the content as a single text block
  const content = `Title: ${short.title || ''}\n` +
                  `Shorts Title Line 1: ${short.titleLine1 || ''}\n` +
                  `Shorts Title Line 2: ${short.titleLine2 || ''}\n\n` +
                  `Status: ${short.status}\n\n` +
                  `--- Script ---\n` +
                  `Idea: ${short.script.idea}\n` +
                  `Draft: ${short.script.draft}\n` +
                  `Hook: ${short.script.hook}\n` +
                  `Body: ${short.script.body}\n` +
                  `CTA: ${short.script.cta}\n\n` +
                  `--- Metadata ---\n` +
                  `Tags: ${short.metadata.tags}\n`;

  requests.push({ insertText: { text: content, location: { index: currentIndex } } });

  // Reset text style to black for the main content to avoid style bleeding from the hidden ID
  requests.push({
    updateTextStyle: {
      range: {
        startIndex: currentIndex,
        endIndex: currentIndex + content.length,
      },
      textStyle: {
        // Set foregroundColor to black
        foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
        // Set font size to 24pt as requested
        fontSize: { magnitude: 24, unit: 'PT' },
      },
      fields: 'foregroundColor,fontSize',
    },
  });

  return requests;
};


/**
 * Finds the index of a named range within a document.
 * @param {Object} document The full Google Doc object.
 * @param {string} rangeName The name of the range to find.
 * @returns {number} The start index of the named range, or -1 if not found.
 */
export const findNamedRangeIndex = (document, rangeName) => {
  if (!document.namedRanges || !document.namedRanges[rangeName]) {
    return -1;
  }
  const ranges = document.namedRanges[rangeName].ranges;
  if (ranges && ranges.length > 0) {
    return ranges[0].startIndex;
  }
  return -1;
};

/**
 * Generates requests to update the Table of Contents with a new entry.
 * @param {Object} short The short object.
 * @param {Object} document The full Google Doc object.
 * @returns {Array<Object>} An array of Google Docs API requests.
 */
export const generateTocUpdateRequest = (short, document) => {
  const tocAnchorIndex = findNamedRangeIndex(document, TOC_ANCHOR_NAME);
  if (tocAnchorIndex === -1) {
    console.error('TOC anchor not found. Cannot update TOC.');
    return []; // Return empty array if anchor is not found
  }

  const bookmarkName = `short_bookmark_${short.id}`;
  const tocText = `${short.title || short.id}\n`;

  return [
    {
      insertText: {
        text: tocText,
        location: {
          index: tocAnchorIndex,
        },
      },
    },
    {
      updateTextStyle: {
        range: {
          startIndex: tocAnchorIndex,
          endIndex: tocAnchorIndex + tocText.length,
        },
        textStyle: {
          link: {
            bookmarkId: bookmarkName,
          },
        },
        fields: 'link',
      },
    },
  ];
};

