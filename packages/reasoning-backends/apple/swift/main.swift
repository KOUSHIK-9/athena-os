import Foundation
import FoundationModels

// AppleModelBridge: a minimal stdio bridge from the Athena TypeScript
// ModelClient seam to the on-device FoundationModels SystemLanguageModel.
//
// Protocol (single request per invocation, line-delimited JSON on stdin):
//   {"prompt": "<user text>", "instructions": "<system prompt>", "maxTokens": 512}
// Response on stdout (JSON, one line):
//   {"ok": true,  "text": "<generated text>"}
//   {"ok": false, "error": "<code>", "message": "<detail>"}
//
// error codes: deviceNotEligible | appleIntelligenceNotEnabled | modelNotReady
//              | generation | unavailable | malformedRequest

enum BridgeError: Error {
    case malformedRequest(String)
    case unavailable(reason: SystemLanguageModel.Availability.UnavailableReason)
}

struct Request: Decodable {
    let prompt: String
    let instructions: String?
    let maxTokens: Int?
}

func emit(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object),
       let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}

func run() async {
    let stdin = FileHandle.standardInput
    let raw = stdin.readDataToEndOfFile()
    guard let line = String(data: raw, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
          let requestData = line.data(using: .utf8) else {
        emit(["ok": false, "error": "malformedRequest", "message": "no JSON request on stdin"])
        return
    }

    let request: Request
    do {
        request = try JSONDecoder().decode(Request.self, from: requestData)
    } catch {
        emit(["ok": false, "error": "malformedRequest", "message": String(describing: error)])
        return
    }

    let system = SystemLanguageModel()
    guard system.isAvailable else {
        switch system.availability {
        case .available:
            emit(["ok": false, "error": "unavailable", "message": "isAvailable false but availability is available"])
        case .unavailable(let reason):
            emit(["ok": false, "error": String(describing: reason), "message": "system language model unavailable"])
        @unknown default:
            emit(["ok": false, "error": "unavailable", "message": "unknown availability state"])
        }
        return
    }

    let maxTokens = request.maxTokens ?? 512
    let session = LanguageModelSession(
        model: .default,
        instructions: request.instructions ?? "You are a helpful assistant."
    )

    do {
        let response = try await session.respond(
            to: request.prompt,
            options: GenerationOptions(sampling: .greedy, maximumResponseTokens: maxTokens)
        )
        emit(["ok": true, "text": response.content])
    } catch {
        emit(["ok": false, "error": "generation", "message": String(describing: error)])
    }
}

// Top-level async entry
await run()
exit(0)
