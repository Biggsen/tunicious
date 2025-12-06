# Account Sidebar Navigation Specification

## **Status**: 📋 Planning

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
  - Profile creation form (when no profile exists)

### Issues with Current Implementation
- All content is stacked vertically in a single long page
- Requires significant scrolling to access different sections
- No clear separation between related functionality
- Poor discoverability of features
- Difficult to navigate between different account-related tasks

## Proposed Structure

### Layout Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Header                           │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│   Sidebar    │        Content Area                  │
│  Navigation  │     (Dynamic Section)                │
│              │                                      │
│  - Profile   │                                      │
│  - Spotify   │                                      │
│  - Last.fm   │                                      │
│  - Cache     │                                      │
│  - Stats     │                                      │
│  - Security  │                                      │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
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
- Profile creation form (if no profile exists)
- Edit profile fields (future enhancement)

#### UI Requirements
- Clean card layout with profile fields
- Consistent with existing account view styling
- Form for profile creation when needed

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
- Only visible when Last.fm username is configured

#### UI Requirements
- Rich statistical display
- Visualizations if available
- Conditional rendering (only show if Last.fm configured)
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

### Option 2: Hash-based Navigation

Use hash fragments for section navigation within a single route.

```
/account#profile
/account#integrations
/account#diagnostics
/account#statistics
/account#cache
/account#security
```

#### Advantages
- Simpler implementation
- No router changes needed
- Faster navigation (no page reload)

#### Disadvantages
- Less semantic URLs
- Browser history navigation less intuitive

## UI/UX Requirements

### Sidebar Design

**Layout**
- Fixed or sticky sidebar on the left
- Width: 240-280px on desktop
- Collapsible on mobile (hamburger menu)
- Always visible on desktop when on account pages

**Styling**
- Use design system colors (mint, delft-blue, celadon)
- Active section highlighted with background color
- Hover states for navigation items
- Icons + text labels for each section
- Consistent spacing and typography

**Responsive Behavior**
- Desktop: Sidebar always visible, content area flexible
- Tablet: Sidebar can collapse/expand
- Mobile: Sidebar hidden by default, toggle button to show

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

- Active section highlighted in sidebar
- Smooth transitions between sections
- Preserve scroll position (optional enhancement)
- Clear visual feedback on navigation

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
**Estimated Time**: 2-3 hours

**Tasks**:
1. Create AccountSidebar component with navigation items
2. Update AccountView to use sidebar + content layout
3. Implement basic section switching (without routes initially)
4. Style sidebar with design system colors
5. Test responsive behavior

### Phase 2: Route Integration
**Priority**: High  
**Estimated Time**: 2-3 hours

**Tasks**:
1. Set up nested routes in router
2. Create section components (extract from current AccountView)
3. Implement router-view in AccountView
4. Update sidebar navigation to use router-links
5. Add default redirect to profile section
6. Test navigation and routing

### Phase 3: Content Migration
**Priority**: High  
**Estimated Time**: 3-4 hours

**Tasks**:
1. Extract Profile section content
2. Extract Integrations section content
3. Extract Diagnostics section content
4. Extract Statistics section content
5. Extract Cache section content
6. Extract Security section content
7. Test each section independently
8. Verify all functionality works correctly

### Phase 4: Polish and Enhancements
**Priority**: Medium  
**Estimated Time**: 2-3 hours

**Tasks**:
1. Add loading states
2. Improve mobile responsiveness
3. Add smooth transitions
4. Enhance active state styling
5. Add section icons
6. Improve accessibility
7. Test across browsers

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

- Keyboard navigation for sidebar
- Focus management on section change
- ARIA labels for navigation items
- Screen reader announcements for section changes
- Skip to content link
- High contrast mode support

## Browser Support

- Modern browsers (last 2 versions)
- CSS Grid and Flexbox required
- ES6+ JavaScript features
- Test on Chrome, Firefox, Safari, Edge

## Testing Strategy

### Manual Testing Checklist
- [ ] Navigate to `/account` redirects to `/account/profile`
- [ ] All sidebar navigation links work correctly
- [ ] Active section is highlighted in sidebar
- [ ] Content displays correctly in each section
- [ ] Mobile sidebar toggle works
- [ ] Responsive layout works on all screen sizes
- [ ] All existing functionality works (connections, diagnostics, etc.)
- [ ] Logout works from security section
- [ ] Browser back/forward navigation works
- [ ] Direct URL access to sections works
- [ ] Loading states display correctly
- [ ] Error states display correctly

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

## Notes

- All existing components (CacheManager, LastFmStats, SpotifyDiagnostic, etc.) remain unchanged
- No changes to composables needed
- Existing styling patterns should be maintained
- Design system colors should be used consistently
- Follow existing code style and patterns
- Consider adding breadcrumbs for navigation context (optional)

