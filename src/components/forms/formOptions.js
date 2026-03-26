export const chatFeatureOptions = [
  {
    value: "on",
    label: "On",
    description: "User can see chats and interact/send/receive messages",
  },
  {
    value: "off",
    label: "Off",
    description: "User cannot see chats or interact with messages",
  },
  {
    value: "view-only",
    label: "View Only",
    description: "User can see messages but cannot interact",
  },
];

export const roleInChatOptions = [
  { value: "chat-operator", label: "Chat Operator" },
  { value: "chat-manager", label: "Chat Manager" },
];

export const callCenterFeatureOptions = [
  {
    value: "on",
    label: "On",
    description: "User can see and interact with calls",
  },
  {
    value: "off",
    label: "Off",
    description: "User cannot see or interact with calls",
  },
];

export const yesNoOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const roleInCallCenterOptions = [
  { value: "call-center-operator", label: "Call Center Operator" },
  { value: "call-center-manager", label: "Call Center Manager" },
];

export const callsAccessOptions = [
  {
    value: "only-calls-by-him",
    label: "Only calls made by him",
    description: "Sees only his own calls",
  },
  {
    value: "calls-by-him-and-group",
    label: "Calls by him + his group",
    description: "Sees calls from his group",
  },
  {
    value: "all-calls",
    label: "All calls",
    description: "Can see all company calls",
  },
];

export const recordingsDownloadOptions = [
  {
    value: "yes",
    label: "Yes",
    description: "Can download call recordings",
  },
  {
    value: "no",
    label: "No",
    description: "Cannot download recordings",
  },
];

export const waitingInLineOptions = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];

// Static playback options for now - dynamic loading can be added later if needed
export const playbackDuringPausedOptions = [
  { value: "default", label: "Default" },
  { value: "choose", label: "Choose" },
];
