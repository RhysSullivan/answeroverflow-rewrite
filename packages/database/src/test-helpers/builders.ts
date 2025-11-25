import {
	sample,
	serverName,
	discordSnowflakeBigInt,
	serverPlan,
	memberCount,
	avatarHash,
	discordUsername,
	channelName,
	channelType,
	messageContent,
	permissions,
	filename,
	fileSize,
	contentType,
} from "@packages/test-utils/arbitraries";
import type {
	Attachment,
	Channel,
	ChannelSettings,
	DiscordAccount,
	Message,
	Server,
	ServerPreferences,
	UserServerSettings,
} from "../../convex/schema";

/**
 * Builder for creating test Server objects.
 * Use the fluent API to customize values, then call build() to get the final object.
 * Uses fast-check to generate random but valid test data.
 */
export class ServerBuilder {
	private data: Partial<Server> = {};

	withDiscordId(discordId: bigint) {
		this.data.discordId = discordId;
		return this;
	}

	withName(name: string) {
		this.data.name = name;
		return this;
	}

	withIcon(icon: string) {
		this.data.icon = icon;
		return this;
	}

	withDescription(description: string) {
		this.data.description = description;
		return this;
	}

	withVanityInviteCode(code: string) {
		this.data.vanityInviteCode = code;
		return this;
	}

	withKickedTime(time: number) {
		this.data.kickedTime = time;
		return this;
	}

	withPlan(plan: Server["plan"]) {
		this.data.plan = plan;
		return this;
	}

	withApproximateMemberCount(count: number) {
		this.data.approximateMemberCount = count;
		return this;
	}

	build(): Server {
		const discordId = this.data.discordId ?? sample(discordSnowflakeBigInt);
		return {
			discordId,
			name: this.data.name ?? sample(serverName),
			approximateMemberCount:
				this.data.approximateMemberCount ?? sample(memberCount),
			plan: this.data.plan ?? sample(serverPlan),
			icon: this.data.icon,
			description: this.data.description,
			vanityInviteCode: this.data.vanityInviteCode,
			kickedTime: this.data.kickedTime,
			vanityUrl: this.data.vanityUrl,
			stripeCustomerId: this.data.stripeCustomerId,
			stripeSubscriptionId: this.data.stripeSubscriptionId,
			preferencesId: this.data.preferencesId,
		};
	}
}

/**
 * Builder for creating test ServerPreferences objects.
 */
export class ServerPreferencesBuilder {
	private data: Partial<ServerPreferences> = {};

	withServerId(serverId: bigint) {
		this.data.serverId = serverId;
		return this;
	}

	withReadTheRulesConsent(enabled: boolean) {
		this.data.readTheRulesConsentEnabled = enabled;
		return this;
	}

	withConsiderAllMessagesPublic(enabled: boolean) {
		this.data.considerAllMessagesPublicEnabled = enabled;
		return this;
	}

	withAnonymizeMessages(enabled: boolean) {
		this.data.anonymizeMessagesEnabled = enabled;
		return this;
	}

	withCustomDomain(domain: string) {
		this.data.customDomain = domain;
		return this;
	}

	withSubpath(subpath: string) {
		this.data.subpath = subpath;
		return this;
	}

	build(): ServerPreferences {
		return {
			serverId: this.data.serverId ?? sample(discordSnowflakeBigInt),
			readTheRulesConsentEnabled: this.data.readTheRulesConsentEnabled,
			considerAllMessagesPublicEnabled:
				this.data.considerAllMessagesPublicEnabled,
			anonymizeMessagesEnabled: this.data.anonymizeMessagesEnabled,
			customDomain: this.data.customDomain,
			subpath: this.data.subpath,
		};
	}
}

/**
 * Builder for creating test DiscordAccount objects.
 */
export class DiscordAccountBuilder {
	private data: Partial<DiscordAccount> = {};

	withId(id: bigint) {
		this.data.id = id;
		return this;
	}

	withName(name: string) {
		this.data.name = name;
		return this;
	}

	withAvatar(avatar: string) {
		this.data.avatar = avatar;
		return this;
	}

	build(): DiscordAccount {
		const id = this.data.id ?? sample(discordSnowflakeBigInt);
		return {
			id,
			name: this.data.name ?? sample(discordUsername),
			avatar: this.data.avatar,
		};
	}
}

/**
 * Builder for creating test Channel objects.
 */
export class ChannelBuilder {
	private data: Partial<Channel> = {};

	withId(id: bigint) {
		this.data.id = id;
		return this;
	}

	withServerId(serverId: bigint) {
		this.data.serverId = serverId;
		return this;
	}

	withName(name: string) {
		this.data.name = name;
		return this;
	}

	withType(type: number) {
		this.data.type = type;
		return this;
	}

	withParentId(parentId: bigint) {
		this.data.parentId = parentId;
		return this;
	}

	withInviteCode(code: string) {
		this.data.inviteCode = code;
		return this;
	}

	withSolutionTagId(tagId: bigint) {
		this.data.solutionTagId = tagId;
		return this;
	}

	build(): Channel {
		const id = this.data.id ?? sample(discordSnowflakeBigInt);
		return {
			id,
			serverId: this.data.serverId ?? sample(discordSnowflakeBigInt),
			name: this.data.name ?? sample(channelName),
			type: this.data.type ?? 0, // Default to text channel, not random
			parentId: this.data.parentId,
			inviteCode: this.data.inviteCode,
			archivedTimestamp: this.data.archivedTimestamp,
			solutionTagId: this.data.solutionTagId,
			lastIndexedSnowflake: this.data.lastIndexedSnowflake,
		};
	}
}

/**
 * Builder for creating test ChannelSettings objects.
 */
export class ChannelSettingsBuilder {
	private data: Partial<ChannelSettings> = {};

	withChannelId(channelId: bigint) {
		this.data.channelId = channelId;
		return this;
	}

	withIndexingEnabled(enabled: boolean) {
		this.data.indexingEnabled = enabled;
		return this;
	}

	withMarkSolutionEnabled(enabled: boolean) {
		this.data.markSolutionEnabled = enabled;
		return this;
	}

	withSendMarkSolutionInstructions(enabled: boolean) {
		this.data.sendMarkSolutionInstructionsInNewThreads = enabled;
		return this;
	}

	withAutoThreadEnabled(enabled: boolean) {
		this.data.autoThreadEnabled = enabled;
		return this;
	}

	withForumGuidelinesConsent(enabled: boolean) {
		this.data.forumGuidelinesConsentEnabled = enabled;
		return this;
	}

	build(): ChannelSettings {
		return {
			channelId: this.data.channelId ?? sample(discordSnowflakeBigInt),
			indexingEnabled: this.data.indexingEnabled ?? false,
			markSolutionEnabled: this.data.markSolutionEnabled ?? false,
			sendMarkSolutionInstructionsInNewThreads:
				this.data.sendMarkSolutionInstructionsInNewThreads ?? false,
			autoThreadEnabled: this.data.autoThreadEnabled ?? false,
			forumGuidelinesConsentEnabled:
				this.data.forumGuidelinesConsentEnabled ?? false,
			botPermissions: this.data.botPermissions,
		};
	}
}

/**
 * Builder for creating test Message objects.
 */
export class MessageBuilder {
	private data: Partial<Message> = {};

	withId(id: bigint) {
		this.data.id = id;
		return this;
	}

	withAuthorId(authorId: bigint) {
		this.data.authorId = authorId;
		return this;
	}

	withServerId(serverId: bigint) {
		this.data.serverId = serverId;
		return this;
	}

	withChannelId(channelId: bigint) {
		this.data.channelId = channelId;
		return this;
	}

	withContent(content: string) {
		this.data.content = content;
		return this;
	}

	withParentChannelId(parentChannelId: bigint) {
		this.data.parentChannelId = parentChannelId;
		return this;
	}

	withChildThreadId(childThreadId: bigint) {
		this.data.childThreadId = childThreadId;
		return this;
	}

	withQuestionId(questionId: bigint) {
		this.data.questionId = questionId;
		return this;
	}

	withReferenceId(referenceId: bigint) {
		this.data.referenceId = referenceId;
		return this;
	}

	build(): Message {
		const id = this.data.id ?? sample(discordSnowflakeBigInt);
		return {
			id,
			authorId: this.data.authorId ?? sample(discordSnowflakeBigInt),
			serverId: this.data.serverId ?? sample(discordSnowflakeBigInt),
			channelId: this.data.channelId ?? sample(discordSnowflakeBigInt),
			content: this.data.content ?? sample(messageContent),
			parentChannelId: this.data.parentChannelId,
			childThreadId: this.data.childThreadId,
			questionId: this.data.questionId,
			referenceId: this.data.referenceId,
			applicationId: this.data.applicationId,
			interactionId: this.data.interactionId,
			webhookId: this.data.webhookId,
			flags: this.data.flags,
			type: this.data.type,
			pinned: this.data.pinned,
			nonce: this.data.nonce,
			tts: this.data.tts,
			embeds: this.data.embeds,
		};
	}
}

/**
 * Builder for creating test UserServerSettings objects.
 */
export class UserServerSettingsBuilder {
	private data: Partial<UserServerSettings> = {};

	withServerId(serverId: bigint) {
		this.data.serverId = serverId;
		return this;
	}

	withUserId(userId: bigint) {
		this.data.userId = userId;
		return this;
	}

	withPermissions(perms: number) {
		this.data.permissions = perms;
		return this;
	}

	withCanPubliclyDisplayMessages(enabled: boolean) {
		this.data.canPubliclyDisplayMessages = enabled;
		return this;
	}

	withMessageIndexingDisabled(disabled: boolean) {
		this.data.messageIndexingDisabled = disabled;
		return this;
	}

	build(): UserServerSettings {
		return {
			serverId: this.data.serverId ?? sample(discordSnowflakeBigInt),
			userId: this.data.userId ?? sample(discordSnowflakeBigInt),
			permissions: this.data.permissions ?? sample(permissions),
			canPubliclyDisplayMessages: this.data.canPubliclyDisplayMessages ?? false,
			messageIndexingDisabled: this.data.messageIndexingDisabled ?? false,
			apiKey: this.data.apiKey,
			apiCallsUsed: this.data.apiCallsUsed ?? 0,
			botAddedTimestamp: this.data.botAddedTimestamp,
		};
	}
}

/**
 * Builder for creating test Attachment objects.
 */
export class AttachmentBuilder {
	private data: Partial<Attachment> = {};

	withId(id: bigint) {
		this.data.id = id;
		return this;
	}

	withMessageId(messageId: bigint) {
		this.data.messageId = messageId;
		return this;
	}

	withFilename(fname: string) {
		this.data.filename = fname;
		return this;
	}

	withSize(size: number) {
		this.data.size = size;
		return this;
	}

	withContentType(ctype: string) {
		this.data.contentType = ctype;
		return this;
	}

	build(): Omit<Attachment, "url"> {
		return {
			id: this.data.id ?? sample(discordSnowflakeBigInt),
			messageId: this.data.messageId ?? sample(discordSnowflakeBigInt),
			filename: this.data.filename ?? sample(filename),
			size: this.data.size ?? sample(fileSize),
			contentType: this.data.contentType ?? sample(contentType),
			width: this.data.width,
			height: this.data.height,
			description: this.data.description,
			storageId: this.data.storageId,
		};
	}
}

// Factory functions for convenient builder creation
export const server = () => new ServerBuilder();
export const serverPreferences = () => new ServerPreferencesBuilder();
export const discordAccount = () => new DiscordAccountBuilder();
export const channel = () => new ChannelBuilder();
export const channelSettings = () => new ChannelSettingsBuilder();
export const message = () => new MessageBuilder();
export const userServerSettings = () => new UserServerSettingsBuilder();
export const attachment = () => new AttachmentBuilder();
