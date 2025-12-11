# Account Sidebar Navigation Specification

## **Status**: ✅ Complete

## Overview

This document specifies the reorganization of the Account Details page from a single long-scrolling page into a sidebar-based navigation system with distinct sections. This improves organization, reduces scrolling, and provides a more intuitive user experience for managing account settings, integrations, diagnostics, and statistics.

## Current State

### Existing Implementation
- ✅ **AccountView** (`/account`) - Single page with all account-related content
  - User profile information (Name, Email, Last.fm Username, Spotify Connection)
  - Spotify connection button
  - Last.fm authentication button
  - Logout button
  - Spotify Diagnostic component
  - Last.fm Diagnostics component
  - Last.fm Stats component
  - Cache Manager component
  - Note: Profile creation is handled by onboarding flow, not in AccountView

### Issues with Current Implementation
- All content is stacked vertically in a single long page
- Requires significant scrolling to access different sections
- No clear separation between related functionality
- Poor discoverability of features
- Difficult to navigate between different account-related tasks

## Proposed Structure

### Layout Architecture

**Desktop/Tablet:**
```
┌─────────────────────────────────────────────────────┐
│                     Header                           │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│   Sidebar    │        Content Area                  │
│  Navigation  │     (Dynamic Section)                │
│              │                                      │
│  - Profile   │                                      │
│  - Integrations│                                    │
│  - Diagnostics│                                     │
│  - Statistics │                                     │
│  - Cache     │                                      │
│  - Security  │                                      │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

**Mobile:**
```
┌─────────────────────────────────────────────────────┐
│                     Header                           │
├──────────────────────────────────────────────────────┤
│  [Profile] [Integrations] [Diagnostics] [Stats] ... │
├──────────────────────────────────────────────────────┤
│                                                      │
│              Content Area                           │
│         (Dynamic Section)                            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Navigation Structure

- **Profile** - User profile information and settings
- **Integrations** - Spotify and Last.fm connection management
- **Diagnostics** - Spotify and Last.fm diagnostic tools
- **Statistics** - Last.fm statistics and listening data
- **Cache** - Cache management and controls
- **Security** - Logout and security settings

## Section Specifications

### 1. Profile Section

**Route**: `/account` (default) or `/account/profile`  
**Icon**: UserIcon (from Heroicons)  
**Order**: 1

#### Purpose
Display and manage user profile information.

#### Content
- **Display Name**
  - Show current display name
  - Edit functionality (optional enhancement)
  
- **Email Address**
  - Show current email
  - Read-only (managed by Firebase Auth)
  
- **Last.fm Username**
  - Show current Last.fm username or "Not set"
  - Edit functionality (optional enhancement)

#### Features
- View current profile information
- Edit profile fields (future enhancement)
- Note: Profile creation is handled by onboarding, so all users will have a profile when accessing this section

#### UI Requirements
- Clean card layout with profile fields
- Consistent with existing account view styling

---

### 2. Integrations Section

**Route**: `/account/integrations`  
**Icon**: LinkIcon or PuzzlePieceIcon  
**Order**: 2

#### Purpose
Manage third-party service connections (Spotify and Last.fm).

#### Content

**Spotify Integration**
- Connection status indicator (✅ Connected / ❌ Not Connected)
- "Connect Spotify Account" button (if not connected)
- Disconnect option (if connected, optional enhancement)
- Last connected date (optional enhancement)

**Last.fm Integration**
- Last.fm username display
- Authentication status indicator
- "Enable Track Loving" button (if username set but not authenticated)
- Connection status indicator
- Disconnect option (optional enhancement)

#### Features
- Visual connection status for each service
- One-click connection buttons
- Clear indication of what each integration enables

#### UI Requirements
- Separate cards for each integration
- Status indicators with icons
- Prominent action buttons
- Clear descriptions of what each integration provides

---

### 3. Diagnostics Section

**Route**: `/account/diagnostics`  
**Icon**: WrenchScrewdriverIcon or BeakerIcon  
**Order**: 3

#### Purpose
Technical diagnostic tools for troubleshooting integration issues.

#### Content

**Spotify Diagnostics**
- SpotifyDiagnostic component
- Token status
- Connection health checks
- API test functions

**Last.fm Diagnostics**
- LastFmDiagnostics component
- Authentication status
- API connection tests
- Token validation

#### Features
- Real-time diagnostic information
- Manual refresh capabilities
- Error reporting and troubleshooting guidance

#### UI Requirements
- Expandable/collapsible sections for each service
- Clear error states and warnings
- Technical information presented clearly
- Action buttons for manual tests

---

### 4. Statistics Section

**Route**: `/account/statistics`  
**Icon**: ChartBarIcon  
**Order**: 4

#### Purpose
Display Last.fm listening statistics and data.

#### Content
- **Last.fm Stats**
  - LastFmStats component
  - User listening statistics
  - Top artists, albums, tracks
  - Listening history data

#### Features
- Comprehensive Last.fm statistics display
- User listening insights
- Section is always visible in navigation; content may show "no data" if Last.fm not configured

#### UI Requirements
- Rich statistical display
- Visualizations if available
- Show appropriate message if Last.fm username not configured
- Loading states for data fetching

---

### 5. Cache Section

**Route**: `/account/cache`  
**Icon**: ArchiveBoxIcon  
**Order**: 5

#### Purpose
Manage application cache and data storage.

#### Content
- **Cache Manager**
  - CacheManager component
  - Cache statistics
  - Manual cache refresh controls
  - Cache clearing options

#### Features
- View cache status and statistics
- Manual cache refresh
- Cache clearing functionality
- Cache size information

#### UI Requirements
- Clear cache statistics display
- Prominent action buttons
- Warning messages for destructive actions
- Confirmation dialogs where appropriate

---

### 6. Security Section

**Route**: `/account/security`  
**Icon**: LockClosedIcon or ShieldCheckIcon  
**Order**: 6

#### Purpose
Security-related settings and account actions.

#### Content
- **Logout**
  - Logout button
  - Confirmation (optional enhancement)
  - Redirect to home after logout

#### Features
- Secure logout functionality
- Clear confirmation before destructive actions (optional)

#### UI Requirements
- Prominent logout button
- Warning styling for logout action
- Clear labeling

---

## Routing Strategy

### Option 1: Nested Routes (Recommended)

Use Vue Router nested routes to maintain a single parent component with sidebar navigation.

```
/account
  ├── /account (default, redirects to /account/profile)
  ├── /account/profile
  ├── /account/integrations
  ├── /account/diagnostics
  ├── /account/statistics
  ├── /account/cache
  └── /account/security
```

#### Advantages
- Clean URL structure
- Browser back/forward navigation works correctly
- Shareable URLs for specific sections
- Better SEO (if applicable)

#### Implementation
- Create `AccountView.vue` as parent with sidebar
- Create child route components or use dynamic content switching
- Use `<router-view>` for content area

### Routing Decision

**Selected Approach**: Nested Routes (Option 1)

This approach will establish the nested route pattern in the codebase, following Vue Router best practices. The router currently uses flat routes, so this will be the first implementation of nested routes.

## UI/UX Requirements

### Sidebar Design

**Layout**
- Fixed or sticky sidebar on the left
- Width: 240-280px on desktop
- Collapsible on mobile (hamburger menu)
- Always visible on desktop when on account pages

**Styling**
- Use design system colors (mint, delft-blue, celadon)
- Active section highlighted (styling to be refined during implementation)
- Hover states for navigation items
- Icons + text labels for each section
- Consistent spacing and typography

**Responsive Behavior**
- Desktop: Sidebar always visible on the left, content area flexible
- Tablet: Sidebar always visible on the left, content area flexible
- Mobile: Navigation links stacked horizontally above content (no drawer/overlay)

### Content Area Design

**Layout**
- Flexible width, takes remaining space
- Consistent padding and spacing
- Maximum width constraint for readability
- Scrollable content when needed

**Styling**
- White or light background
- Card-based layout for sections
- Consistent spacing between elements
- Loading and error states

### Navigation Behavior

- Active section highlighted in sidebar (styling to be refined)
- Smooth transitions between sections
- Preserve scroll position (optional enhancement)
- Clear visual feedback on navigation
- All sections always visible in navigation (no conditional hiding)

## Technical Implementation

### Component Structure

```
src/views/auth/
├── AccountView.vue (parent, contains sidebar + router-view)
├── account/
│   ├── ProfileSection.vue
│   ├── IntegrationsSection.vue
│   ├── DiagnosticsSection.vue
│   ├── StatisticsSection.vue
│   ├── CacheSection.vue
│   └── SecuritySection.vue
└── components/ (if needed)
    └── AccountSidebar.vue (optional, extracted sidebar)
```

### Router Updates

```javascript
{
  path: '/account',
  component: AccountView,
  meta: { requiresAuth: true },
  children: [
    {
      path: '',
      redirect: 'profile'
    },
    {
      path: 'profile',
      component: ProfileSection,
      name: 'account-profile'
    },
    {
      path: 'integrations',
      component: IntegrationsSection,
      name: 'account-integrations'
    },
    {
      path: 'diagnostics',
      component: DiagnosticsSection,
      name: 'account-diagnostics'
    },
    {
      path: 'statistics',
      component: StatisticsSection,
      name: 'account-statistics'
    },
    {
      path: 'cache',
      component: CacheSection,
      name: 'account-cache'
    },
    {
      path: 'security',
      component: SecuritySection,
      name: 'account-security'
    }
  ]
}
```

### Composables

- Reuse existing composables:
  - `useAuth` - Authentication and logout
  - `useUserData` - User data fetching
  - `useSpotifyAuth` - Spotify authentication
  - `useLastFmApi` - Last.fm functionality

### State Management

- Use existing composables for data
- No additional state management needed
- Shared state via composables (Vue reactivity)

## Implementation Phases

### Phase 1: Basic Sidebar Structure
**Priority**: High  
**Status**: ✅ Complete

**Tasks**:
1. ✅ Create AccountSidebar component with navigation items
2. ✅ Update AccountView to use sidebar + content layout
3. ✅ Style sidebar with design system colors
4. ✅ Implement responsive behavior (desktop sidebar, mobile stacked links)
5. ✅ Test responsive behavior across breakpoints

### Phase 2: Route Integration
**Priority**: High  
**Status**: ✅ Complete

**Tasks**:
1. ✅ Set up nested routes in router
2. ✅ Create section components (extract from current AccountView)
3. ✅ Implement router-view in AccountView
4. ✅ Update sidebar navigation to use router-links
5. ✅ Add default redirect to profile section
6. ✅ Test navigation and routing

### Phase 3: Content Migration
**Priority**: High  
**Status**: ✅ Complete

**Tasks**:
1. ✅ Extract Profile section content
2. ✅ Extract Integrations section content
3. ✅ Extract Diagnostics section content
4. ✅ Extract Statistics section content
5. ✅ Extract Cache section content
6. ✅ Extract Security section content
7. ✅ Test each section independently
8. ✅ Verify all functionality works correctly

### Phase 4: Polish and Enhancements
**Priority**: Medium  
**Status**: ✅ Complete

**Tasks**:
1. ✅ Add loading states
2. ✅ Improve mobile responsiveness
3. ✅ Add smooth transitions
4. ✅ Enhance active state styling
5. ✅ Add section icons
6. ⏭️ Improve accessibility (deferred - basic accessibility in place)
7. ✅ Test across browsers

## Migration Strategy

### Backward Compatibility
- Keep existing `/account` route functional
- Redirect `/account` to `/account/profile` for existing links
- No breaking changes to existing functionality

### Data Migration
- No database changes required
- No data migration needed
- All existing composables and data fetching remain unchanged

### Rollback Plan
- Keep old AccountView as backup
- Can revert router changes if issues arise
- All existing functionality preserved in components

## Accessibility Considerations

*Note: Basic accessibility is in place (semantic HTML, router-link components). Advanced accessibility features (focus management, ARIA announcements, skip links) are deferred for future enhancement if needed.*

## Browser Support

- Modern browsers (last 2 versions)
- CSS Grid and Flexbox required
- ES6+ JavaScript features
- Test on Chrome, Firefox, Safari, Edge

## Testing Strategy

### Manual Testing Checklist
- [x] Navigate to `/account` redirects to `/account/profile`
- [x] All sidebar navigation links work correctly
- [x] Active section is highlighted in sidebar
- [x] Content displays correctly in each section
- [x] Mobile navigation displays as stacked links above content
- [x] Responsive layout works on all screen sizes
- [x] All existing functionality works (connections, diagnostics, etc.)
- [x] Logout works from security section
- [x] Browser back/forward navigation works
- [x] Direct URL access to sections works
- [x] Loading states display correctly
- [x] Error states display correctly

### Component Testing
- Test each section component independently
- Test sidebar navigation component
- Test router integration
- Test responsive breakpoints

## Future Enhancements

- Profile editing functionality
- Integration disconnect options
- Additional security settings
- Password change functionality
- Email verification status display
- Account deletion option
- Data export functionality
- Notification preferences

## Implementation Notes

- ✅ All existing components (CacheManager, LastFmStats, SpotifyDiagnostic, etc.) remain unchanged
- ✅ No changes to composables needed
- ✅ Existing styling patterns maintained
- ✅ Design system colors used consistently
- ✅ Followed existing code style and patterns
- ✅ Profile creation form logic removed from AccountView (handled by onboarding)
- ✅ All navigation sections are always visible; content within sections may be conditional
- ✅ Mobile navigation: stacked links above content (not drawer/overlay)
- ✅ First implementation of nested routes in the router
- ✅ Created reusable Card component for consistent styling
- ✅ Updated all sections to use Card component
- ✅ Removed nested panels from diagnostics and cache sections
- ✅ Logout button updated to use BaseButton primary variant

