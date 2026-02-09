// Prompt Builder - Creates Gemini prompts from manifest (multilingual support)

import type { GlideManifest } from '../types/manifest';

/**
 * Build system prompt for Gemini based on app manifest
 * Includes multilingual support (English + Swahili)
 */
export function buildSystemPrompt(manifest: GlideManifest, currentRoute: string | null): string {
  const actionsSection = buildActionsSection(manifest);

  // Generate a dynamic example from the first action
  const exampleSection = buildExampleSection(manifest, currentRoute);

  // Build navigation routes section
  const routesList = Object.entries(manifest.navigation)
    .map(([name, route]) => `  ${name}: "${route.description}" (${route.path})`)
    .join('\n');

  return `You are Glide for "${manifest.app.name}". Convert commands to JSON action plans.

IMPORTANT: Users may speak English or Swahili. Extract entities regardless of language.

Current page: ${currentRoute || 'unknown'}

## Available Pages
${routesList}

## Actions
${actionsSection}

${exampleSection}

## Navigation-only example for "show me sales" or "go to stock":
{"intent":"navigate","confidence":0.9,"entities":{},"steps":[{"type":"navigate","target":"sales"}],"confirmMessage":"Go to Sales page?"}

## Delete example for "delete farmer john doe":
{"intent":"delete-add-farmer","confidence":0.9,"entities":{"searchText":"john doe"},"steps":[{"type":"navigate","target":"farmers"},{"type":"find-row","value":"searchText","action":"delete"}],"confirmMessage":"Delete farmer john doe?"}

## Update example for "update farmer john doe to inactive status":
{"intent":"update-add-farmer","confidence":0.9,"entities":{"searchText":"john doe","status":"inactive"},"steps":[{"type":"navigate","target":"farmers"},{"type":"find-row","value":"searchText","action":"edit","waitFor":"form"},{"type":"select","target":"#status-selector","value":"status"},{"type":"submit","target":"#submit-btn"}],"confirmMessage":"Update farmer john doe to inactive status?"}

## Step types:
- navigate: {"type":"navigate","target":"routeName"} - Use route NAME not path
- click: {"type":"click","target":"selector","waitFor":"selector"}
- fill: {"type":"fill","target":"selector","value":"entityKey"} - value = key from entities object
- select: {"type":"select","target":"selector","value":"entityKey"}
- submit: {"type":"submit","target":"selector","waitFor":"selector"}
- find-row: {"type":"find-row","value":"searchText","action":"edit|delete"} - Find a record in a table row

## Rules:
1. Extract ALL values from command into entities object
2. If command is just navigation (e.g. "show me sales", "go to stock"), return navigate step ONLY
3. If current page != action route, add navigate step FIRST with route NAME
4. If action has trigger, add click step AFTER navigate
5. Add fill/select step for EACH extracted entity using the field's selector
6. In fill/select steps, "value" = the entity KEY (e.g. "name"), not the actual value
7. Add submit step at the end - ALWAYS include waitFor and errorSelector from the action's submit config
8. For UPDATE commands: navigate → find-row(action:"edit", waitFor: trigger's waitFor) → fill/select ONLY changed fields → submit. Extract the record identifier as "searchText" entity.
9. For DELETE commands: navigate → find-row(action:"delete"). Extract the record identifier as "searchText" entity. Do NOT add fill/select/submit steps.
10. For update/delete, use the SAME action definition as create — same route, same field selectors. The find-row step replaces the trigger click.
11. The intent for updates should be "update-{actionName}" and for deletes "delete-{actionName}" (e.g. "update-add-farmer", "delete-add-farmer").

Output JSON only:`;
}

/**
 * Build compact actions section with all needed selectors
 */
function buildActionsSection(manifest: GlideManifest): string {
  return Object.entries(manifest.actions)
    .map(([name, action]) => {
      const fields = Object.entries(action.form)
        .map(([fieldName, field]) => {
          const req = field.required ? '*' : '';
          const hints = field.semantic.slice(0, 3).join('/');
          return `    ${fieldName}${req}(${field.type}): "${field.selector}" [${hints}]`;
        })
        .join('\n');

      const trigger = action.trigger
        ? `  trigger: "${action.trigger.selector}" waitFor:"${action.trigger.waitFor || ''}"\n`
        : '';
      const submitParts = [];
      if (action.submit) {
        submitParts.push(`"${action.submit.selector}"`);
        if (action.submit.waitFor) submitParts.push(`waitFor:"${action.submit.waitFor}"`);
        if (action.submit.errorSelector) submitParts.push(`errorSelector:"${action.submit.errorSelector}"`);
      }
      const submit = action.submit
        ? `  submit: ${submitParts.join(' ')}\n`
        : '';

      return `[${name}] route:${action.route} keywords:[${action.keywords.slice(0, 5).join(',')}] Supports: create, update, delete
${trigger}${fields}
${submit}`;
    })
    .join('\n');
}

/**
 * Build a dynamic example from the first action in the manifest
 */
function buildExampleSection(manifest: GlideManifest, currentRoute: string | null): string {
  const actionEntries = Object.entries(manifest.actions);
  if (actionEntries.length === 0) return '';

  const [actionName, action] = actionEntries[0];
  const fields = Object.entries(action.form);

  // Build example entities
  const entities: Record<string, string> = {};
  const steps: object[] = [];

  // Navigate step
  if (action.route !== currentRoute) {
    steps.push({ type: 'navigate', target: action.route });
  }

  // Trigger click step
  if (action.trigger) {
    steps.push({
      type: 'click',
      target: action.trigger.selector,
      ...(action.trigger.waitFor ? { waitFor: action.trigger.waitFor } : {}),
    });
  }

  // Fill/select steps for each field
  for (const [fieldName, field] of fields.slice(0, 3)) {
    entities[fieldName] = `<${fieldName}>`;
    if (field.type === 'select') {
      steps.push({ type: 'select', target: field.selector, value: fieldName });
    } else {
      steps.push({ type: 'fill', target: field.selector, value: fieldName });
    }
  }

  // Submit step
  if (action.submit) {
    const submitStep: Record<string, string> = {
      type: 'submit',
      target: action.submit.selector,
    };
    if (action.submit.waitFor) submitStep.waitFor = action.submit.waitFor;
    steps.push(submitStep);
  }

  const example = {
    intent: actionName,
    confidence: 0.95,
    entities,
    steps,
    confirmMessage: `${action.description}?`,
  };

  return `## Example output structure:
${JSON.stringify(example)}`;
}

/**
 * Build user message
 */
export function buildUserMessage(command: string): string {
  return `User command: "${command}"

Extract entities and return the action plan as JSON:`;
}
