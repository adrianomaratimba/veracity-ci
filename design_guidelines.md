# Veracity Design Guidelines

## Design Approach
**Material Design System** - Selected for data-rich applications requiring clear hierarchy, excellent form patterns, and robust component library. Material's elevation system and structured layouts excel in professional survey/analytics contexts.

## Core Design Elements

### Typography
- **Primary Font:** Inter (Google Fonts) - exceptional readability for data-dense interfaces
- **Hierarchy:**
  - Page Titles: 2xl, semibold
  - Section Headers: xl, semibold  
  - Card Titles: lg, medium
  - Body Text: base, normal
  - Labels/Meta: sm, medium
  - Data/Numbers: mono font for tables/stats

### Layout System
**Spacing Units:** Tailwind 2, 4, 6, 8, 12, 16 for consistency
- Sidebar: Fixed 64px (collapsed) / 256px (expanded)
- Main content: max-w-7xl with px-6 py-8
- Card padding: p-6
- Component spacing: gap-6 for grids, space-y-4 for stacks

### Component Library

**Navigation:**
- Persistent left sidebar with logo, navigation items (icon + label), user profile at bottom
- Top bar: Breadcrumbs, search, notifications, theme toggle, user menu
- Mobile: Collapsible drawer overlay

**Survey Management:**
- Survey list: Card grid (2 columns desktop, 1 mobile) with title, status badge, progress bar, metadata (created date, responses count), action menu
- Survey builder: Multi-step wizard with progress indicator, left question palette, center canvas, right properties panel
- Question types: Multiple choice cards, rating scales, text inputs, date pickers, file uploads

**Team Management:**
- Table view with avatar column, name/email, role dropdown, status badges, action buttons
- Role cards: Visual hierarchy showing permissions as expandable lists
- Invite modal: Form with email input, role selector, permission preview

**Question Modules:**
- Library grid: Reusable module cards with preview, usage count, edit/duplicate/delete actions
- Module editor: Drag-drop question builder with demographic templates (age, location, education, etc.)

**Analytics Dashboard:**
- Summary cards row: 4-column grid (total surveys, active, responses, completion rate) with large numbers and trend indicators
- Chart section: Response timeline (line chart), demographic breakdowns (pie/bar charts), geographic heatmap
- Data tables: Sortable columns, inline filters, export button, pagination
- Visualization cards: Elevated containers with chart, title, description, filter dropdown

**Forms:**
- Floating labels for inputs
- Helper text beneath fields
- Inline validation with icons
- Multi-step forms with stepper component
- Action buttons: Primary (filled), Secondary (outlined), aligned right

**Data Display:**
- Elevated cards (subtle shadow)
- Tables with alternating row hover states
- Status badges with rounded corners
- Progress bars with percentage labels
- Empty states with illustrations and CTA

**Modals/Overlays:**
- Centered overlay with backdrop blur
- Header with close button
- Content area with scrollable body
- Footer with action buttons (cancel left, primary right)

### Animations
**Minimal & Purposeful:**
- Sidebar expand/collapse transition (300ms ease)
- Card hover lift (subtle transform)
- Page transitions: Fade-in (200ms)
- No decorative or scroll-triggered animations

## Images Section

**No Hero Image** - This is a professional dashboard application, not a marketing site.

**Image Usage:**
- **User Avatars:** Team management tables and user menus (40px circular)
- **Empty States:** Custom illustrations for "No surveys yet", "No team members", "No data available" (200x200px, centered in cards)
- **Onboarding Graphics:** Simple diagrams showing survey workflow in tutorial modals (300x200px)
- **Data Visualizations:** Chart.js or similar library-generated graphics, not static images

**No decorative imagery** - Keep focus on functionality and data.