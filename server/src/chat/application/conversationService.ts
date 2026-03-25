import type {
  ImageLabConversationView,
  ImageLabObservabilityView,
  ImageLabPromptArtifactsView,
} from "../../../../shared/imageLabViews";
import type { ChatStateRepository } from "../persistence/types";
import {
  projectConversationView,
  projectObservabilityView,
  projectPromptArtifactsView,
} from "./projectConversationView";

export class ImageLabConversationService {
  constructor(private readonly repository: ChatStateRepository) {}

  async getConversation(userId: string, conversationId?: string): Promise<ImageLabConversationView> {
    const session = await this.repository.getConversationSnapshot(userId, conversationId);
    return projectConversationView(session);
  }

  async clearConversation(userId: string): Promise<ImageLabConversationView> {
    const session = await this.repository.clearActiveConversation(userId);
    return projectConversationView(session);
  }

  async deleteTurn(userId: string, turnId: string): Promise<ImageLabConversationView | null> {
    const session = await this.repository.deleteTurn(userId, turnId);
    return session ? projectConversationView(session) : null;
  }

  async acceptTurn(input: {
    userId: string;
    turnId: string;
    assetId: string;
    acceptedAt: string;
  }): Promise<ImageLabConversationView> {
    const session = await this.repository.acceptConversationTurn(input);
    return projectConversationView(session);
  }

  async getPromptArtifacts(
    userId: string,
    turnId: string
  ): Promise<ImageLabPromptArtifactsView | null> {
    const response = await this.repository.getPromptArtifactsForTurn(userId, turnId);
    return response ? projectPromptArtifactsView(response) : null;
  }

  async getObservability(
    userId: string,
    conversationId?: string
  ): Promise<ImageLabObservabilityView | null> {
    const response = await this.repository.getPromptObservabilityForConversation(
      userId,
      conversationId
    );
    return response ? projectObservabilityView(response) : null;
  }
}
