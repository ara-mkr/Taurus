// taurus-permissions (owner, November 23, 2026: "make it ask for all permissions just as a pop up like everything ...
// from privacy and security like calender, photos, files, everything!"). A tiny program the desktop app runs on first
// launch, and again from the tray's "Allow everything…". It shows macOS's own prompt for each permission that has one,
// one after another, and prints what each ended as. It reads nothing and keeps nothing: every request is made and the
// object that made it is thrown away. The owner decides each prompt; macOS remembers the answer.
//
//   taurus-permissions status          prints {"calendars":"granted", ...}
//   taurus-permissions ask             asks for every one still undecided, then prints the same
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <EventKit/EventKit.h>
#import <Contacts/Contacts.h>
#import <Photos/Photos.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <CoreLocation/CoreLocation.h>
#import <Speech/Speech.h>
#import <IOKit/hidsystem/IOHIDLib.h>

static NSString *ekState(EKEntityType type) {
  EKAuthorizationStatus s = [EKEventStore authorizationStatusForEntityType:type];
  if (s == EKAuthorizationStatusFullAccess) return @"granted";
  if (s == EKAuthorizationStatusWriteOnly) return @"limited";
  return s == EKAuthorizationStatusNotDetermined ? @"ask" : s == EKAuthorizationStatusDenied || s == EKAuthorizationStatusRestricted ? @"denied" : @"granted";
}
static NSString *contactsState(void) {
  CNAuthorizationStatus s = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
  return s == CNAuthorizationStatusNotDetermined ? @"ask" : s == CNAuthorizationStatusAuthorized ? @"granted" : @"denied";
}
static NSString *photosState(void) {
  PHAuthorizationStatus s = [PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
  return s == PHAuthorizationStatusNotDetermined ? @"ask" : s == PHAuthorizationStatusAuthorized || s == PHAuthorizationStatusLimited ? @"granted" : @"denied";
}
static NSString *bluetoothState(void) {
  CBManagerAuthorization s = CBManager.authorization;
  return s == CBManagerAuthorizationNotDetermined ? @"ask" : s == CBManagerAuthorizationAllowedAlways ? @"granted" : @"denied";
}
static NSString *locationState(CLLocationManager *m) {
  CLAuthorizationStatus s = m.authorizationStatus;
  return s == kCLAuthorizationStatusNotDetermined ? @"ask" : s == kCLAuthorizationStatusAuthorizedAlways ? @"granted" : @"denied";
}
static NSString *speechState(void) {
  SFSpeechRecognizerAuthorizationStatus s = SFSpeechRecognizer.authorizationStatus;
  return s == SFSpeechRecognizerAuthorizationStatusNotDetermined ? @"ask" : s == SFSpeechRecognizerAuthorizationStatusAuthorized ? @"granted" : @"denied";
}
static NSString *inputState(void) {
  IOHIDAccessType s = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent);
  return s == kIOHIDAccessTypeUnknown ? @"ask" : s == kIOHIDAccessTypeGranted ? @"granted" : @"denied";
}

@interface Asker : NSObject <CBCentralManagerDelegate, CLLocationManagerDelegate>
@property (strong) CBCentralManager *bluetooth;
@property (strong) CLLocationManager *location;
@property (assign) BOOL waitingBluetooth, waitingLocation;
@end
@implementation Asker
- (void)centralManagerDidUpdateState:(CBCentralManager *)central { if (CBManager.authorization != CBManagerAuthorizationNotDetermined) self.waitingBluetooth = NO; }
- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager { if (manager.authorizationStatus != kCLAuthorizationStatusNotDetermined) self.waitingLocation = NO; }
@end

// Waits for one prompt's answer while the run loop keeps the prompt alive. Two minutes at most each.
static void waitFor(BOOL (^done)(void)) {
  NSDate *until = [NSDate dateWithTimeIntervalSinceNow:120];
  while (!done() && [until timeIntervalSinceNow] > 0) [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
}

static NSDictionary *status(CLLocationManager *m) {
  return @{ @"calendars": ekState(EKEntityTypeEvent), @"reminders": ekState(EKEntityTypeReminder), @"contacts": contactsState(), @"photos": photosState(),
            @"bluetooth": bluetoothState(), @"location": locationState(m), @"speech": speechState(), @"inputMonitoring": inputState() };
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *verb = argc > 1 ? [NSString stringWithUTF8String:argv[1]] : @"status";
    [NSApplication sharedApplication];
    Asker *asker = [Asker new];
    CLLocationManager *probe = [CLLocationManager new];
    if ([verb isEqual:@"ask"]) {
      __block BOOL waiting = NO;
      EKEventStore *store = [EKEventStore new];
      if ([ekState(EKEntityTypeEvent) isEqual:@"ask"]) {
        waiting = YES;
        [store requestFullAccessToEventsWithCompletion:^(BOOL g, NSError *e) { waiting = NO; }];
        waitFor(^{ return (BOOL)!waiting; });
      }
      if ([ekState(EKEntityTypeReminder) isEqual:@"ask"]) {
        waiting = YES;
        [store requestFullAccessToRemindersWithCompletion:^(BOOL g, NSError *e) { waiting = NO; }];
        waitFor(^{ return (BOOL)!waiting; });
      }
      if ([contactsState() isEqual:@"ask"]) {
        waiting = YES;
        [[CNContactStore new] requestAccessForEntityType:CNEntityTypeContacts completionHandler:^(BOOL g, NSError *e) { waiting = NO; }];
        waitFor(^{ return (BOOL)!waiting; });
      }
      if ([photosState() isEqual:@"ask"]) {
        waiting = YES;
        [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus s) { waiting = NO; }];
        waitFor(^{ return (BOOL)!waiting; });
      }
      if ([speechState() isEqual:@"ask"]) {
        waiting = YES;
        [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus s) { waiting = NO; }];
        waitFor(^{ return (BOOL)!waiting; });
      }
      if ([bluetoothState() isEqual:@"ask"]) {
        asker.waitingBluetooth = YES;
        asker.bluetooth = [[CBCentralManager alloc] initWithDelegate:asker queue:nil options:@{ CBCentralManagerOptionShowPowerAlertKey: @NO }];
        waitFor(^{ return (BOOL)!asker.waitingBluetooth; });
        asker.bluetooth = nil;
      }
      if ([locationState(probe) isEqual:@"ask"]) {
        asker.waitingLocation = YES;
        asker.location = [CLLocationManager new];
        asker.location.delegate = asker;
        [asker.location requestAlwaysAuthorization];
        waitFor(^{ return (BOOL)!asker.waitingLocation; });
        asker.location = nil;
      }
      if ([inputState() isEqual:@"ask"]) IOHIDRequestAccess(kIOHIDRequestTypeListenEvent);
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:status(probe) options:0 error:nil];
    fwrite(json.bytes, 1, json.length, stdout);
    fputc('\n', stdout);
  }
  return 0;
}
