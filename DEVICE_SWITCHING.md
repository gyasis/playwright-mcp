# Device Switching Tool for Playwright MCP

## Overview

The `browser_switch_device` tool provides dynamic device emulation switching for the Playwright MCP server. Switch between desktop and mobile devices mid-session while preserving your browsing state.

## Features

- **143 Device Support**: All Playwright devices (mobile, tablet, desktop)
- **Smart Aspect Ratio**: Maintains device proportions within browser constraints
- **Session Preservation**: Keeps tabs and URLs when switching devices
- **True Emulation**: Mobile user agents, touch events, and media queries
- **Convenient Aliases**: Simple shortcuts for common devices

## Tool Definition

```typescript
browser_switch_device(device: string)
```

**Parameters:**
- `device` (string): Device name or alias to emulate

**Type:** Destructive (recreates browser context)

## Supported Devices

### Mobile Devices (56 total)
```
iPhone Series:
- iPhone 6, 7, 8, SE, X, XR
- iPhone 11, 11 Pro, 11 Pro Max  
- iPhone 12, 12 Pro, 12 Pro Max, 12 Mini
- iPhone 13, 13 Pro, 13 Pro Max, 13 Mini
- iPhone 14, 14 Plus, 14 Pro, 14 Pro Max
- iPhone 15, 15 Plus, 15 Pro, 15 Pro Max

Android Devices:
- Pixel 2, 2 XL, 3, 4, 4a (5G), 5, 7
- Galaxy S III, S5, S8, S9+, S24, A55
- Galaxy Note II, Note 3
- Nexus 4, 5, 5X, 6, 6P
- BlackBerry Z30, Nokia Lumia, LG Optimus, Moto G4
```

### Tablet Devices (73 total)
```
iPads:
- iPad (gen 5, 6, 7, 11)
- iPad Mini, iPad Pro 11
- All landscape orientations

Android Tablets:
- Galaxy Tab S4, S9
- Nexus 7, 10
- Kindle Fire HDX
- All mobile devices in landscape mode
```

### Desktop Devices (14 total)
```
- Desktop Chrome, Edge, Firefox, Safari
- High DPI variants of all browsers
```

## Usage Examples

### Basic Device Switching

```javascript
// Switch to latest iPhone
await browser_switch_device("iPhone 15");

// Switch to Android flagship
await browser_switch_device("Pixel 7");

// Switch to tablet
await browser_switch_device("iPad Pro 11");

// Back to desktop
await browser_switch_device("desktop");
```

### Using Aliases

```javascript
// Convenient shortcuts
await browser_switch_device("iphone");   // → iPhone 13
await browser_switch_device("android");  // → Pixel 7  
await browser_switch_device("mobile");   // → iPhone 13
await browser_switch_device("ipad");     // → iPad Pro
```

### Legacy Device Testing

```javascript
// Test older devices
await browser_switch_device("iPhone 6");
await browser_switch_device("Nokia Lumia 520");
await browser_switch_device("BlackBerry Z30");
```

## How It Works

### 1. Device Validation
- Checks against Playwright's device registry
- Supports exact names and convenient aliases
- Provides helpful error messages for invalid devices

### 2. Context Recreation
- Saves current tab URLs
- Closes existing browser context  
- Creates new context with device settings
- Restores tabs with saved URLs

### 3. Smart Aspect Ratio Calculation

**Problem:** Browser windows can't shrink below ~400px width, but mobile devices are often 393px.

**Solution:** Calculate optimal viewport that maintains device aspect ratio:

```javascript
// Example: iPhone 15 (393x659)
const aspectRatio = 393 / 659;  // ≈ 0.596
const optimalWidth = 400;       // Browser minimum
const optimalHeight = 400 / aspectRatio; // ≈ 671px

// Result: 400x671 viewport that feels like iPhone
```

### 4. Device Categories

- **Mobile** (width ≤500px): Scale to 400-500px, maintain ratio
- **Tablet** (width ≤1024px): Use device dimensions if reasonable
- **Desktop** (width >1024px): Full 1280x720 viewport

## What Gets Emulated

### ✅ True Device Emulation
- **User Agent**: Mobile/desktop browser strings
- **Viewport**: Device screen dimensions
- **Touch Events**: Enabled for mobile devices
- **Media Queries**: CSS responds to device characteristics
- **Device Scale Factor**: Pixel density simulation

### ✅ Preserved Across Switches
- **Tab URLs**: All open pages restored
- **Session State**: Cookies and storage maintained
- **Navigation History**: Within each context

## Browser Window Constraints

**Important:** Device emulation affects the **content viewport**, not the browser window size.

- **Window Size**: Limited by OS (~400px minimum width)
- **Content Rendering**: Correctly shows mobile layout
- **User Agent**: Reports as mobile device
- **Touch Support**: Enabled for mobile interactions

The aspect ratio solution provides the best possible mobile experience within these constraints.

## Error Handling

```javascript
// Invalid device name
await browser_switch_device("iPhone 99");
// Error: Unknown device: iPhone 99. Use "desktop" or a device from playwright.devices like "iPhone 15", "Pixel 7", etc.

// Valid alternatives suggested in error message
```

## Performance Notes

- **Context Recreation**: ~1-2 seconds per switch
- **Tab Restoration**: Automatic for all open URLs
- **Memory Usage**: Old context cleaned up automatically
- **Network**: Pages reload in new device context

## Best Practices

1. **Test Responsive Design**: Switch between mobile/desktop to verify layouts
2. **Use Aliases**: `"mobile"` and `"desktop"` for quick switching  
3. **Specific Testing**: Use exact device names for precise emulation
4. **Session Planning**: Switch devices before complex workflows
5. **Headless Mode**: Use for automated testing across devices

## Example Workflow

```javascript
// Start with desktop
await browser_navigate("https://example.com");
await browser_snapshot(); // See desktop layout

// Switch to mobile
await browser_switch_device("iPhone 15");
await browser_snapshot(); // See mobile layout

// Test tablet experience  
await browser_switch_device("iPad Pro 11");
await browser_snapshot(); // See tablet layout

// Back to desktop
await browser_switch_device("desktop");
```

## Integration

The device switching tool integrates seamlessly with all other Playwright MCP tools:

- **Navigation**: Works with `browser_navigate`, `browser_navigate_back`
- **Interaction**: Compatible with `browser_click`, `browser_type`, `browser_hover`
- **Capture**: Use with `browser_snapshot`, `browser_take_screenshot`
- **Tabs**: Supports `browser_tab_new`, `browser_tab_select`

## Troubleshooting

**Device not found?**
- Check spelling: Device names are case-sensitive
- Use aliases: `"iphone"`, `"android"`, `"mobile"`
- List all devices: See the complete list above

**Page looks wrong?**
- Device emulation is working if user agent changed
- Browser window size ≠ device viewport size
- Mobile layouts should render correctly regardless of window size

**Slow switching?**
- Context recreation is normal (~1-2 seconds)
- Use headless mode for faster automated testing
- Consider batching device tests together

---

*This tool provides the most comprehensive device emulation available in browser automation, supporting all 143 Playwright devices with intelligent aspect ratio handling.*