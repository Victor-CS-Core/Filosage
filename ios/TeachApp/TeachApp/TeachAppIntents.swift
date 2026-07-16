import AppIntents
import Foundation

struct TeachTopicEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Erudoza Topic")
    static let defaultQuery = TeachTopicQuery()

    let id: String
    let title: String
    let mission: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(mission)")
    }
}

struct TeachTopicQuery: EntityQuery {
    func entities(for identifiers: [TeachTopicEntity.ID]) async throws -> [TeachTopicEntity] {
        sampleTopics.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [TeachTopicEntity] {
        sampleTopics
    }

    func defaultResult() async -> TeachTopicEntity? {
        sampleTopics.first
    }

    private var sampleTopics: [TeachTopicEntity] {
        SampleCourseStore().courses.map {
            TeachTopicEntity(id: $0.id, title: $0.topic, mission: $0.mission)
        }
    }
}

struct OpenTeachTopicIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Erudoza Topic"
    static let description = IntentDescription("Open Erudoza to a selected course topic.")
    static let openAppWhenRun = true

    @Parameter(title: "Topic")
    var topic: TeachTopicEntity

    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(topic.title, forKey: "PendingTeachTopic")
        return .result()
    }
}

enum StudyMode: String, AppEnum {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Study Mode")
    static let caseDisplayRepresentations: [StudyMode: DisplayRepresentation] = [
        .lesson: "Lesson",
        .quiz: "Quiz",
        .tutor: "Tutor"
    ]

    case lesson
    case quiz
    case tutor
}

struct StartStudySessionIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Study Session"
    static let description = IntentDescription("Start a focused study session for an Erudoza topic.")

    @Parameter(title: "Topic")
    var topic: TeachTopicEntity

    @Parameter(title: "Mode", default: .lesson)
    var mode: StudyMode

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let modeName: String
        switch mode {
        case .lesson:
            modeName = "lesson"
        case .quiz:
            modeName = "quiz"
        case .tutor:
            modeName = "tutor"
        }

        return .result(dialog: "Ready for a \(modeName) session on \(topic.title).")
    }
}

struct TeachAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenTeachTopicIntent(),
            phrases: [
                "Open a topic in \(.applicationName)",
                "Study with \(.applicationName)"
            ],
            shortTitle: "Open Topic",
            systemImageName: "book"
        )

        AppShortcut(
            intent: StartStudySessionIntent(),
            phrases: [
                "Start a study session with \(.applicationName)",
                "Quiz me with \(.applicationName)"
            ],
            shortTitle: "Study Session",
            systemImageName: "graduationcap"
        )
    }
}
