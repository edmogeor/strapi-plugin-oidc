# UI String Casing Style Guide

This guide defines the casing conventions for all user-facing strings in the plugin's admin panel frontend, based on the Strapi admin panel conventions.

---

## 1. Title Case

**Capitalize the first letter of each major word. Do NOT capitalize articles, conjunctions, or prepositions (unless they're the first word).**

### When to Use

- Page titles
- Section headings
- Navigation menu items
- Sub-navigation items
- Feature/component names
- Modal titles

### Examples

| Correct             | Incorrect           |
| ------------------- | ------------------- |
| Content Manager     | Content manager     |
| Media Library       | Media library       |
| API Tokens          | Api tokens          |
| Transfer Tokens     | Transfer tokens     |
| Single Sign-On      | Single sign-on      |
| Content History     | Content history     |
| Audit Logs          | Audit logs          |
| Collection Types    | collection types    |
| Single Types        | single types        |
| Roles & Permissions | roles & permissions |
| User profile        | User Profile        |
| Overview            | OVERVIEW            |

---

## 2. Sentence Case

**Capitalize only the first letter of the string and any proper nouns.**

### When to Use

- Button labels and text
- Form labels and placeholders
- Descriptions and helper text
- Error messages and notifications
- Success messages
- Inline descriptions

### Examples

| Context      | Correct                                | Incorrect                 |
| ------------ | -------------------------------------- | ------------------------- |
| Button       | Save                                   | SAVE                      |
| Button       | Cancel                                 | Cancel                    |
| Button       | Create new entry                       | Create New Entry          |
| Button       | Add Widget                             | Add widget                |
| Button       | Delete                                 | DELETE                    |
| Form label   | Email                                  | email                     |
| Form label   | Password                               | Password                  |
| Form label   | First name                             | First Name                |
| Form label   | Last name                              | Last Name                 |
| Description  | List of generated tokens               | List of Generated Tokens  |
| Error        | Name already assigned to another token | Name Already Assigned     |
| Notification | Token copied to clipboard              | Token Copied To Clipboard |

---

## 3. ALL CAPS

**Only for special emphasis or hard-coded regulatory labels.**

### When to Use

- Very rare, only when specifically required by Strapi conventions

### Examples

| Correct      | Context                              |
| ------------ | ------------------------------------ |
| GO BACK HOME | Auth form button (Strapi convention) |

---

## 4. Lowercase

**Operators and technical labels that function as programmatic values.**

### When to Use

- Filter operators
- Technical field names in certain contexts

### Examples

| Correct         | Incorrect       |
| --------------- | --------------- |
| contains        | Contains        |
| is              | Is              |
| starts with     | Starts With     |
| ends with       | Ends With       |
| is greater than | Is Greater Than |
| is not          | Is Not          |

---

## Quick Reference

| UI Element      | Casing        | Examples                                 |
| --------------- | ------------- | ---------------------------------------- |
| Page title      | Title Case    | "Overview", "API Tokens"                 |
| Section heading | Title Case    | "Token permissions"                      |
| Navigation item | Title Case    | "Content Manager", "Plugins"             |
| Button label    | Sentence Case | "Save", "Create new entry", "Add Widget" |
| Form label      | Sentence Case | "Email", "Password", "First name"        |
| Placeholder     | Sentence Case | "e.g. kai@doe.com"                       |
| Description     | Sentence Case | "List of generated tokens..."            |
| Error message   | Sentence Case | "Name already assigned"                  |
| Success toast   | Sentence Case | "Changes saved"                          |
| Filter operator | lowercase     | "contains", "is", "starts with"          |
| Toggle enabled  | Sentence Case | "Enabled", "Disabled"                    |

---

## Implementation in Code

### Using `formatMessage` with Translation Keys

```tsx
import { useIntl } from 'react-intl';

const { formatMessage } = useIntl();

// Navigation - Title Case
intlLabel={{ id: 'plugin.nav.label', defaultMessage: 'My Plugin' }}

// Button - Sentence Case
formatMessage({ id: 'plugin.button.save', defaultMessage: 'Save' })

// Form label - Sentence Case
formatMessage({ id: 'plugin.form.email', defaultMessage: 'Email' })

// Description - Sentence Case
formatMessage({ id: 'plugin.description', defaultMessage: 'Configure plugin settings' })
```

### Inline Messages

```tsx
// Title Case - page title
<Page.Title>
  {formatMessage({ id: 'plugin.page.title', defaultMessage: 'Plugin Settings' })}
</Page.Title>

// Button - Sentence Case
<Button onClick={handleSave}>
  {formatMessage({ id: 'global.save', defaultMessage: 'Save' })}
</Button>

// Description - Sentence Case
<Text>
  {formatMessage({
    id: 'plugin.settings.description',
    defaultMessage: 'Manage your plugin configuration'
  })}
</Text>
```

---

## Common Mistakes to Avoid

1. **Title Case for Buttons**
   - Bad: `defaultMessage: 'Save Settings'`
   - Good: `defaultMessage: 'Save settings'`

2. **Sentence Case for Navigation**
   - Bad: `defaultMessage: 'Api tokens'`
   - Good: `defaultMessage: 'API Tokens'`

3. **ALL CAPS for Emphasis**
   - Bad: `defaultMessage: 'COPY TOKEN'`
   - Good: `defaultMessage: 'Copy token'`

4. **Lowercase for Form Labels**
   - Bad: `defaultMessage: 'email'`
   - Good: `defaultMessage: 'Email'`
