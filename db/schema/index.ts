import { users, userStatusEnum } from "./users";
import { organizations, organizationStatusEnum } from "./organizations";
import {
  memberships,
  membershipRoleEnum,
  membershipStatusEnum,
} from "./memberships";
import { sessions } from "./sessions";
import { auditEvents } from "./audit-events";
import {
  agentProfiles,
  verificationStatusEnum,
  profileVisibilityEnum,
} from "./agent-profiles";
import { organizationProfiles } from "./organization-profiles";
import {
  agentPosts,
  agentPostTypeEnum,
  agentPostVisibilityEnum,
} from "./agent-posts";
import { customers } from "./customers";
import {
  conversations,
  conversationStatusEnum,
  conversationPriorityEnum,
  conversationChannelEnum,
} from "./conversations";
import {
  conversationParticipants,
  participantRoleEnum,
} from "./conversation-participants";
import {
  messages,
  messageSenderTypeEnum,
  messageTypeEnum,
} from "./messages";
import { conversationNotes } from "./conversation-notes";
import { conversationAssignments } from "./conversation-assignments";
import { conversationTags, conversationTagLinks } from "./conversation-tags";
import { conversationReadState } from "./conversation-read-state";

export {
  users,
  userStatusEnum,
  organizations,
  organizationStatusEnum,
  memberships,
  membershipRoleEnum,
  membershipStatusEnum,
  sessions,
  auditEvents,
  agentProfiles,
  verificationStatusEnum,
  profileVisibilityEnum,
  organizationProfiles,
  agentPosts,
  agentPostTypeEnum,
  agentPostVisibilityEnum,
  customers,
  conversations,
  conversationStatusEnum,
  conversationPriorityEnum,
  conversationChannelEnum,
  conversationParticipants,
  participantRoleEnum,
  messages,
  messageSenderTypeEnum,
  messageTypeEnum,
  conversationNotes,
  conversationAssignments,
  conversationTags,
  conversationTagLinks,
  conversationReadState,
};

export const schema = {
  users,
  organizations,
  memberships,
  sessions,
  auditEvents,
  agentProfiles,
  organizationProfiles,
  agentPosts,
  customers,
  conversations,
  conversationParticipants,
  messages,
  conversationNotes,
  conversationAssignments,
  conversationTags,
  conversationTagLinks,
  conversationReadState,
  userStatusEnum,
  organizationStatusEnum,
  membershipRoleEnum,
  membershipStatusEnum,
  verificationStatusEnum,
  profileVisibilityEnum,
  agentPostTypeEnum,
  agentPostVisibilityEnum,
  conversationStatusEnum,
  conversationPriorityEnum,
  conversationChannelEnum,
  participantRoleEnum,
  messageSenderTypeEnum,
  messageTypeEnum,
};

export type { User, NewUser } from "./users";
export type { Organization, NewOrganization } from "./organizations";
export type {
  Membership,
  NewMembership,
  MembershipRole,
  MembershipStatus,
} from "./memberships";
export type { Session, NewSession } from "./sessions";
export type { AuditEvent, NewAuditEvent, AuditEventType } from "./audit-events";
export type {
  AgentProfile,
  NewAgentProfile,
  VerificationStatus,
  ProfileVisibility,
} from "./agent-profiles";
export type {
  OrganizationProfile,
  NewOrganizationProfile,
} from "./organization-profiles";
export type {
  AgentPost,
  NewAgentPost,
  AgentPostType,
  AgentPostVisibility,
} from "./agent-posts";
export type { Customer, NewCustomer } from "./customers";
export type {
  Conversation,
  NewConversation,
  ConversationStatus,
  ConversationPriority,
  ConversationChannel,
} from "./conversations";
export type {
  ConversationParticipant,
  NewConversationParticipant,
  ParticipantRole,
} from "./conversation-participants";
export type {
  Message,
  NewMessage,
  MessageSenderType,
  MessageType,
} from "./messages";
export type {
  ConversationNote,
  NewConversationNote,
} from "./conversation-notes";
export type {
  ConversationAssignment,
  NewConversationAssignment,
} from "./conversation-assignments";
export type {
  ConversationTag,
  NewConversationTag,
  ConversationTagLink,
} from "./conversation-tags";
export type {
  ConversationReadState,
  NewConversationReadState,
} from "./conversation-read-state";
