// taurus-hands (owner, November 5, 2026: helpers in other apps; docs/19-computer-use.md).
// A small program the desktop app runs and talks to over stdin, one JSON request per line, one JSON reply per line.
// Fixed verbs only, no shell:
//   status, ask, apps, where, front, look, tree, press, focus, move, click, drag, scroll, type, key
// What it may touch is decided by the desktop app (the owner's allow list); on top of that it always refuses the apps in
// `never` and leaves password managers out of every picture. It types nothing while macOS Secure Input is on, so it
// can't type into password fields. Screen Recording and Accessibility are switched on by the owner, never by this.
// Objective-C rather than Swift: it builds with plain clang, whatever state the Swift toolchain is in.

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

static NSSet<NSString *> *never, *hiddenApps;
static NSMutableDictionary<NSNumber *, NSArray *> *cache;
static CGEventSourceRef source;

static void reply(NSDictionary *object) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  if (!data) return;
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

#define REFUSE(text) do { *why = (text); return nil; } while (0)

static NSRunningApplication *findApp(id name, NSString **why) {
  NSString *wanted = [name isKindOfClass:NSString.class] ? [name stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet] : @"";
  if (!wanted.length) REFUSE(@"Say which app.");
  NSString *low = wanted.lowercaseString;
  NSRunningApplication *found = nil;
  for (NSRunningApplication *a in NSWorkspace.sharedWorkspace.runningApplications) {
    if (a.activationPolicy != NSApplicationActivationPolicyRegular) continue;
    if ([a.bundleIdentifier.lowercaseString isEqual:low] || [a.localizedName.lowercaseString isEqual:low]) { found = a; break; }
    if (!found && [a.localizedName.lowercaseString hasPrefix:low]) found = a;
  }
  if (!found) REFUSE(([NSString stringWithFormat:@"%@ isn't open.", wanted]));
  if (found.bundleIdentifier && [never containsObject:found.bundleIdentifier]) REFUSE(([NSString stringWithFormat:@"Taurus never works in %@.", found.localizedName ?: found.bundleIdentifier]));
  return found;
}

// ---------- Reading an app: its buttons, fields and tabs by name ----------

static id attr(AXUIElementRef el, CFStringRef name) {
  CFTypeRef value = NULL;
  if (AXUIElementCopyAttributeValue(el, name, &value) == kAXErrorSuccess && value) return CFBridgingRelease(value);
  return nil;
}
static NSString *text(AXUIElementRef el, CFStringRef name) {
  id v = attr(el, name);
  if (![v isKindOfClass:NSString.class]) return nil;
  NSString *t = [v stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (!t.length) return nil;
  return t.length > 120 ? [t substringToIndex:120] : t;
}
static BOOL frameOf(AXUIElementRef el, CGRect *r) {
  id p = attr(el, kAXPositionAttribute), s = attr(el, kAXSizeAttribute);
  if (!p || !s) return NO;
  CGPoint point; CGSize size;
  AXValueGetValue((__bridge AXValueRef)p, kAXValueTypeCGPoint, &point);
  AXValueGetValue((__bridge AXValueRef)s, kAXValueTypeCGSize, &size);
  *r = (CGRect){ point, size };
  return YES;
}
static NSSet<NSString *> *roles(void) {
  static NSSet *set;
  if (!set) set = [NSSet setWithArray:@[@"AXButton", @"AXCheckBox", @"AXRadioButton", @"AXTextField", @"AXTextArea", @"AXSearchField", @"AXLink", @"AXTab", @"AXTabGroup",
    @"AXMenuItem", @"AXMenuButton", @"AXPopUpButton", @"AXComboBox", @"AXSlider", @"AXStaticText", @"AXImage", @"AXCell", @"AXRow", @"AXDisclosureTriangle", @"AXIncrementor", @"AXHeading"]];
  return set;
}
static void walk(AXUIElementRef el, int depth, NSMutableArray *found, NSMutableArray *items) {
  if (depth > 30 || items.count >= 350) return;
  NSString *role = text(el, kAXRoleAttribute) ?: @"";
  CGRect f;
  if ([roles() containsObject:role] && frameOf(el, &f) && f.size.width > 1 && f.size.height > 1) {
    BOOL secure = [text(el, kAXSubroleAttribute) isEqual:@"AXSecureTextField"];
    BOOL textual = [role isEqual:@"AXStaticText"] || [role isEqual:@"AXHeading"];
    NSString *label = text(el, kAXTitleAttribute) ?: text(el, kAXDescriptionAttribute) ?: (textual ? text(el, kAXValueAttribute) : nil) ?: text(el, kAXHelpAttribute);
    BOOL editable = [@[@"AXTextField", @"AXTextArea", @"AXSearchField", @"AXComboBox"] containsObject:role];
    if (label || editable) {
      NSMutableDictionary *item = [@{ @"id": @(found.count), @"role": [[role substringFromIndex:2] lowercaseString],
        @"x": @((int)CGRectGetMidX(f)), @"y": @((int)CGRectGetMidY(f)), @"w": @((int)f.size.width), @"h": @((int)f.size.height) } mutableCopy];
      if (label) item[@"label"] = label;
      if (editable) item[@"value"] = secure ? @"(password, hidden)" : (text(el, kAXValueAttribute) ?: @"");
      if (secure) item[@"secure"] = @YES;
      [items addObject:item];
      [found addObject:(__bridge id)el];
    }
  }
  for (id child in (NSArray *)attr(el, kAXChildrenAttribute) ?: @[]) walk((__bridge AXUIElementRef)child, depth + 1, found, items);
}
static NSDictionary *tree(NSRunningApplication *app, NSString **why) {
  if (!AXIsProcessTrusted()) REFUSE(@"Accessibility is off for Taurus. Switch it on in System Settings, Privacy & Security, Accessibility.");
  AXUIElementRef root = AXUIElementCreateApplication(app.processIdentifier);
  id window = attr(root, kAXFocusedWindowAttribute) ?: attr(root, kAXMainWindowAttribute) ?: [(NSArray *)attr(root, kAXWindowsAttribute) firstObject];
  CFRelease(root);
  if (!window) REFUSE(([NSString stringWithFormat:@"%@ has no window open.", app.localizedName ?: @"That app"]));
  NSMutableArray *found = [NSMutableArray array], *items = [NSMutableArray array];
  AXUIElementRef win = (__bridge AXUIElementRef)window;
  walk(win, 0, found, items);
  cache[@(app.processIdentifier)] = found;
  NSMutableDictionary *out = [@{ @"app": app.localizedName ?: @"", @"title": text(win, kAXTitleAttribute) ?: @"", @"elements": items } mutableCopy];
  CGRect f;
  if (frameOf(win, &f)) out[@"window"] = @{ @"x": @((int)f.origin.x), @"y": @((int)f.origin.y), @"w": @((int)f.size.width), @"h": @((int)f.size.height) };
  return out;
}
static AXUIElementRef element(NSRunningApplication *app, id ident, NSString **why) {
  NSArray *list = cache[@(app.processIdentifier)];
  if (![ident isKindOfClass:NSNumber.class] || !list || [ident integerValue] < 0 || [ident integerValue] >= (NSInteger)list.count) { *why = @"Read the app again first: that element isn't known."; return NULL; }
  return (__bridge AXUIElementRef)list[[ident integerValue]];
}

// ---------- The real pointer and keyboard ----------

static CGPoint here(void) { CGEventRef e = CGEventCreate(NULL); CGPoint p = CGEventGetLocation(e); CFRelease(e); return p; }
static BOOL point(NSDictionary *args, NSString *xs, NSString *ys, CGPoint *out) {
  id x = args[xs], y = args[ys];
  if (![x isKindOfClass:NSNumber.class] || ![y isKindOfClass:NSNumber.class]) return NO;
  *out = CGPointMake([x doubleValue], [y doubleValue]);
  return YES;
}
static void post(CGEventType type, CGPoint at, int64_t clicks) {
  CGEventRef e = CGEventCreateMouseEvent(source, type, at, kCGMouseButtonLeft);
  CGEventSetIntegerValueField(e, kCGMouseEventClickState, clicks);
  CGEventPost(kCGHIDEventTap, e);
  CFRelease(e);
}
// Moves the way a hand does: a short glide, not a jump, so you can see where it went.
static void glide(CGPoint to, BOOL dragging) {
  CGPoint from = here();
  for (int i = 1; i <= 14; i++) {
    double t = i / 14.0, e = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;
    post(dragging ? kCGEventLeftMouseDragged : kCGEventMouseMoved, CGPointMake(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e), 1);
    usleep(9000);
  }
}
static NSDictionary<NSString *, NSNumber *> *keys(void) {
  return @{ @"return": @36, @"enter": @36, @"tab": @48, @"escape": @53, @"delete": @51, @"space": @49, @"up": @126, @"down": @125, @"left": @123, @"right": @124, @"pageup": @116, @"pagedown": @121 };
}

// ---------- Pictures ----------

static NSDictionary *look(NSDictionary *args, NSString **why) {
  if (!CGPreflightScreenCaptureAccess()) REFUSE(@"Screen Recording is off for Taurus. Switch it on in System Settings, Privacy & Security, Screen & System Audio Recording.");
  NSString *wanted = [args[@"app"] isKindOfClass:NSString.class] ? args[@"app"] : nil;
  NSRunningApplication *target = nil;
  if (wanted && !(target = findApp(wanted, why))) return nil;
  double maxWidth = [args[@"maxWidth"] isKindOfClass:NSNumber.class] ? [args[@"maxWidth"] doubleValue] : 1440;
  __block NSDictionary *result = nil;
  __block NSString *problem = @"The picture didn't come.";
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES completionHandler:^(SCShareableContent *content, NSError *error) {
    if (!content) { problem = error.localizedDescription ?: problem; dispatch_semaphore_signal(done); return; }
    NSMutableArray<SCWindow *> *windows = [NSMutableArray array];
    for (SCWindow *w in content.windows) if (w.windowLayer == 0 && w.frame.size.width > 40 && ![hiddenApps containsObject:w.owningApplication.bundleIdentifier ?: @""]) [windows addObject:w];
    SCContentFilter *filter = nil;
    CGSize size = CGSizeZero;
    if (target) {
      SCWindow *best = nil;
      for (SCWindow *w in windows) if (w.owningApplication.processID == target.processIdentifier && (!best || w.frame.size.width * w.frame.size.height > best.frame.size.width * best.frame.size.height)) best = w;
      if (!best) { problem = [NSString stringWithFormat:@"%@ has no window on screen.", wanted]; dispatch_semaphore_signal(done); return; }
      filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:best];
      size = best.frame.size;
    } else {
      CGPoint pointer = here();
      SCDisplay *display = content.displays.firstObject;
      for (SCDisplay *d in content.displays) if (CGRectContainsPoint(d.frame, pointer)) display = d;
      if (!display) { problem = @"No screen found."; dispatch_semaphore_signal(done); return; }
      NSMutableArray *leaveOut = [NSMutableArray array];
      for (SCRunningApplication *a in content.applications) if ([hiddenApps containsObject:a.bundleIdentifier]) [leaveOut addObject:a];
      filter = [[SCContentFilter alloc] initWithDisplay:display excludingApplications:leaveOut exceptingWindows:@[]];
      size = display.frame.size;
    }
    double scale = MIN(1, maxWidth / size.width);
    SCStreamConfiguration *config = [SCStreamConfiguration new];
    config.width = (size_t)(size.width * scale); config.height = (size_t)(size.height * scale);
    config.showsCursor = YES;
    [SCScreenshotManager captureImageWithFilter:filter configuration:config completionHandler:^(CGImageRef image, NSError *error2) {
      if (!image) { problem = error2.localizedDescription ?: problem; dispatch_semaphore_signal(done); return; }
      NSData *jpeg = [[[NSBitmapImageRep alloc] initWithCGImage:image] representationUsingType:NSBitmapImageFileTypeJPEG properties:@{ NSImageCompressionFactor: @0.6 }];
      NSMutableArray *list = [NSMutableArray array];
      for (SCWindow *w in windows) {
        if (list.count >= 30) break;
        NSString *title = w.title ?: @"";
        [list addObject:@{ @"app": w.owningApplication.applicationName ?: @"", @"title": title.length > 100 ? [title substringToIndex:100] : title,
          @"x": @((int)w.frame.origin.x), @"y": @((int)w.frame.origin.y), @"w": @((int)w.frame.size.width), @"h": @((int)w.frame.size.height) }];
      }
      result = @{ @"image": [@"data:image/jpeg;base64," stringByAppendingString:[jpeg base64EncodedStringWithOptions:0]], @"width": @(config.width), @"height": @(config.height), @"windows": list };
      dispatch_semaphore_signal(done);
    }];
  }];
  if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC))) REFUSE(@"The picture took too long.");
  if (!result) *why = problem;
  return result;
}

// ---------- The verbs ----------

static NSDictionary *run(NSString *verb, NSDictionary *args, NSString **why) {
  NSArray *verbs = @[@"status", @"ask", @"apps", @"where", @"front", @"look", @"tree", @"press", @"focus", @"move", @"click", @"drag", @"scroll", @"type", @"key", @"arrange"];
  if (![verbs containsObject:verb]) REFUSE(([NSString stringWithFormat:@"No verb called %@.", verb]));
  BOOL hands = AXIsProcessTrusted();
  NSString *handsOff = @"Accessibility is off for Taurus. Switch it on in System Settings, Privacy & Security, Accessibility.";
  if ([verb isEqual:@"status"]) return @{ @"screen": @(CGPreflightScreenCaptureAccess()), @"accessibility": @(hands), @"secureInput": @(IsSecureEventInputEnabled()) };
  if ([verb isEqual:@"ask"]) {
    // Shows macOS's own prompts; the owner decides in System Settings. Only the owner's tap in Taurus asks.
    if ([args[@"screen"] isEqual:@YES]) CGRequestScreenCaptureAccess();
    if ([args[@"accessibility"] isEqual:@YES]) AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{ (__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES });
    return @{ @"asked": @YES };
  }
  if ([verb isEqual:@"apps"]) {
    NSMutableArray *list = [NSMutableArray array];
    for (NSRunningApplication *a in NSWorkspace.sharedWorkspace.runningApplications)
      if (a.activationPolicy == NSApplicationActivationPolicyRegular && ![never containsObject:a.bundleIdentifier ?: @""]) [list addObject:@{ @"name": a.localizedName ?: @"", @"bundle": a.bundleIdentifier ?: @"", @"active": @(a.active) }];
    return @{ @"apps": list };
  }
  if ([verb isEqual:@"where"]) { CGPoint p = here(); return @{ @"x": @((int)p.x), @"y": @((int)p.y) }; }
  if ([verb isEqual:@"look"]) return look(args, why);
  NSRunningApplication *app = nil;
  if ([@[@"front", @"tree", @"press", @"focus", @"arrange"] containsObject:verb] && !(app = findApp(args[@"app"], why))) return nil;
  if ([verb isEqual:@"front"]) { [app activateWithOptions:0]; usleep(250000); return @{ @"front": app.localizedName ?: @"" }; }
  if ([verb isEqual:@"tree"]) return tree(app, why);
  if (!hands) REFUSE(handsOff);
  if ([verb isEqual:@"arrange"]) {
    NSString *side = [args[@"side"] isKindOfClass:NSString.class] ? args[@"side"] : @"";
    if (![@[@"left", @"right", @"maximize"] containsObject:side]) REFUSE(@"Choose left, right or maximize.");
    AXUIElementRef root = AXUIElementCreateApplication(app.processIdentifier);
    id window = attr(root, kAXFocusedWindowAttribute) ?: attr(root, kAXMainWindowAttribute);
    CFRelease(root);
    if (!window) REFUSE(@"That app has no window to arrange.");
    AXUIElementRef win = (__bridge AXUIElementRef)window;
    CGRect old;
    if (!frameOf(win, &old)) REFUSE(@"Cannot read that window’s position.");
    CGFloat top = NSScreen.screens.firstObject.frame.size.height;
    NSScreen *display = NSScreen.mainScreen;
    for (NSScreen *s in NSScreen.screens) {
      NSRect frame = s.frame;
      CGRect cg = CGRectMake(frame.origin.x, top - NSMaxY(frame), frame.size.width, frame.size.height);
      if (CGRectContainsPoint(cg, CGPointMake(CGRectGetMidX(old), CGRectGetMidY(old)))) { display = s; break; }
    }
    NSRect visible = display.visibleFrame;
    CGFloat width = [side isEqual:@"maximize"] ? visible.size.width : floor(visible.size.width / 2);
    CGPoint position = CGPointMake(visible.origin.x + ([side isEqual:@"right"] ? visible.size.width - width : 0), top - NSMaxY(visible));
    CGSize size = CGSizeMake(width, visible.size.height);
    // AX moves the window without clicking an unknown title bar or a control underneath it.
    // The coloured pointer accompanies this verified move; it does not pretend to press a button.
    glide(CGPointMake(old.origin.x + old.size.width / 2, old.origin.y + 12), NO);
    AXValueRef sz = AXValueCreate(kAXValueCGSizeType, &size);
    AXValueRef pos = AXValueCreate(kAXValueCGPointType, &position);
    AXError resized = AXUIElementSetAttributeValue(win, kAXSizeAttribute, sz);
    AXError moved = AXUIElementSetAttributeValue(win, kAXPositionAttribute, pos);
    CFRelease(sz); CFRelease(pos);
    glide(CGPointMake(position.x + width / 2, position.y + 12), NO);
    usleep(80000);
    CGRect after;
    BOOL verified = resized == kAXErrorSuccess && moved == kAXErrorSuccess && frameOf(win, &after)
      && fabs(after.origin.x - position.x) < 8 && fabs(after.origin.y - position.y) < 8
      && fabs(after.size.width - size.width) < 8 && fabs(after.size.height - size.height) < 8;
    if (!verified) REFUSE(@"The window may have moved, but its requested size or position could not be verified. Check it before asking again.");
    return @{ @"placed": @YES, @"side": side };
  }
  if ([verb isEqual:@"press"] || [verb isEqual:@"focus"]) {
    AXUIElementRef el = element(app, args[@"id"], why);
    if (!el) return nil;
    if ([verb isEqual:@"focus"]) { AXUIElementSetAttributeValue(el, kAXFocusedAttribute, kCFBooleanTrue); return @{ @"focused": args[@"id"] }; }
    if (AXUIElementPerformAction(el, kAXPressAction) != kAXErrorSuccess) REFUSE(@"That element can't be pressed by name; click it instead.");
    return @{ @"pressed": args[@"id"] };
  }
  CGPoint at, to;
  if ([verb isEqual:@"move"]) { if (!point(args, @"x", @"y", &at)) REFUSE(@"Say where."); glide(at, NO); return @{ @"x": @((int)at.x), @"y": @((int)at.y) }; }
  if ([verb isEqual:@"click"]) {
    if (!point(args, @"x", @"y", &at)) REFUSE(@"Say where.");
    int count = MAX(1, MIN(3, [args[@"count"] isKindOfClass:NSNumber.class] ? [args[@"count"] intValue] : 1));
    glide(at, NO);
    for (int i = 1; i <= count; i++) { post(kCGEventLeftMouseDown, at, i); usleep(30000); post(kCGEventLeftMouseUp, at, i); usleep(60000); }
    return @{ @"x": @((int)at.x), @"y": @((int)at.y) };
  }
  if ([verb isEqual:@"drag"]) {
    if (!point(args, @"x", @"y", &at) || !point(args, @"toX", @"toY", &to)) REFUSE(@"Say from where and to where.");
    glide(at, NO); post(kCGEventLeftMouseDown, at, 1); usleep(120000);
    glide(to, YES); usleep(80000); post(kCGEventLeftMouseUp, to, 1);
    return @{ @"x": @((int)to.x), @"y": @((int)to.y) };
  }
  if ([verb isEqual:@"scroll"]) {
    if (!point(args, @"x", @"y", &at)) REFUSE(@"Say where.");
    int dy = MAX(-3000, MIN(3000, [args[@"dy"] isKindOfClass:NSNumber.class] ? [args[@"dy"] intValue] : 400));
    glide(at, NO);
    for (int i = 0; i < 6; i++) { CGEventRef e = CGEventCreateScrollWheelEvent2(source, kCGScrollEventUnitPixel, 1, -dy / 6, 0, 0); CGEventPost(kCGHIDEventTap, e); CFRelease(e); usleep(16000); }
    return @{ @"scrolled": @(dy) };
  }
  if ([verb isEqual:@"type"]) {
    if (IsSecureEventInputEnabled()) REFUSE(@"A password field has the keyboard. Taurus doesn't type passwords.");
    NSString *words = [args[@"text"] isKindOfClass:NSString.class] ? args[@"text"] : @"";
    if (words.length > 2000) words = [words substringToIndex:2000];
    for (NSUInteger start = 0; start < words.length; start += 16) {
      NSUInteger n = MIN(16, words.length - start);
      UniChar chars[16];
      [words getCharacters:chars range:NSMakeRange(start, n)];
      for (int down = 1; down >= 0; down--) { CGEventRef e = CGEventCreateKeyboardEvent(source, 0, down); CGEventKeyboardSetUnicodeString(e, n, chars); CGEventPost(kCGHIDEventTap, e); CFRelease(e); }
      usleep(12000);
    }
    return @{ @"typed": @(words.length) };
  }
  if ([verb isEqual:@"key"]) {
    NSNumber *code = keys()[[args[@"key"] isKindOfClass:NSString.class] ? [args[@"key"] lowercaseString] : @""];
    if (!code) REFUSE(([NSString stringWithFormat:@"Keys: %@.", [[keys().allKeys sortedArrayUsingSelector:@selector(compare:)] componentsJoinedByString:@", "]]));
    for (int down = 1; down >= 0; down--) { CGEventRef e = CGEventCreateKeyboardEvent(source, (CGKeyCode)code.intValue, down); CGEventPost(kCGHIDEventTap, e); CFRelease(e); }
    return @{ @"key": args[@"key"] };
  }
  REFUSE(([NSString stringWithFormat:@"No verb called %@.", verb]));
}

int main(void) {
  @autoreleasepool {
    never = [NSSet setWithArray:@[@"com.1password.1password", @"com.agilebits.onepassword7", @"com.agilebits.onepassword-osx", @"com.bitwarden.desktop",
      @"com.lastpass.LastPass", @"com.dashlane.dashlanephonefinal", @"com.dashlane.Dashlane", @"com.apple.keychainaccess", @"com.apple.Passwords",
      @"com.apple.systempreferences", @"com.apple.Settings", @"com.apple.Terminal", @"com.googlecode.iterm2", @"dev.warp.Warp-Stable", @"com.mitchellh.ghostty"]];
    hiddenApps = [NSSet setWithArray:@[@"com.1password.1password", @"com.agilebits.onepassword7", @"com.agilebits.onepassword-osx", @"com.bitwarden.desktop",
      @"com.lastpass.LastPass", @"com.dashlane.dashlanephonefinal", @"com.dashlane.Dashlane", @"com.apple.keychainaccess", @"com.apple.Passwords"]];
    cache = [NSMutableDictionary dictionary];
    source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    [NSThread detachNewThreadWithBlock:^{
      char *line = NULL; size_t cap = 0;
      while (getline(&line, &cap, stdin) > 0) {
        @autoreleasepool {
          NSData *data = [NSData dataWithBytes:line length:strlen(line)];
          NSDictionary *request = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
          if (![request isKindOfClass:NSDictionary.class]) continue;
          id ident = request[@"id"] ?: @0;
          NSString *why = nil;
          NSString *verb = [request[@"verb"] isKindOfClass:NSString.class] ? request[@"verb"] : @"";
          NSDictionary *args = [request[@"args"] isKindOfClass:NSDictionary.class] ? request[@"args"] : @{};
          NSDictionary *answer = run(verb, args, &why);
          reply(answer ? @{ @"id": ident, @"ok": @YES, @"data": answer } : @{ @"id": ident, @"ok": @NO, @"error": why ?: @"That didn't work." });
        }
      }
      exit(0);
    }];
    [[NSRunLoop mainRunLoop] run];
  }
  return 0;
}
