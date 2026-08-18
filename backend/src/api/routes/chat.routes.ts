import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

export interface ChatServiceLike {
  chat(request: {
    message: string;
    conversationId?: string;
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  }): Promise<unknown>;
}

export function createChatRouter(chatService: ChatServiceLike): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, conversationId, conversationHistory } = req.body as {
        message?: string;
        conversationId?: string;
        conversationHistory?: Array<{
          role: "user" | "assistant";
          content: string;
        }>;
      };

      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return res
          .status(400)
          .json({
            error: "message é obrigatório e deve ser uma string não-vazia",
          });
      }
      if (conversationId !== undefined && typeof conversationId !== "string") {
        return res
          .status(400)
          .json({ error: "conversationId deve ser uma string" });
      }
      if (
        conversationHistory !== undefined &&
        (!Array.isArray(conversationHistory) ||
          conversationHistory.length > 10 ||
          conversationHistory.some(
            (turn) =>
              !turn ||
              !["user", "assistant"].includes(turn.role) ||
              typeof turn.content !== "string",
          ))
      ) {
        return res
          .status(400)
          .json({ error: "conversationHistory possui formato inválido" });
      }

      const response = await chatService.chat({
        message: message.trim(),
        conversationId,
        conversationHistory,
      });
      return res.json(response);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
