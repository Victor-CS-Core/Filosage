import Foundation

struct Course: Identifiable, Hashable {
    let id: String
    let topic: String
    let mission: String
    let modules: [CourseModule]

    var lessonCount: Int {
        modules.reduce(0) { $0 + $1.lessons.count }
    }
}

struct CourseModule: Identifiable, Hashable {
    let id: String
    let title: String
    let lessons: [Lesson]
}

struct Lesson: Identifiable, Hashable {
    let id: String
    let title: String
    let concept: String
    let reading: String
    let quiz: Quiz
}

struct Quiz: Hashable {
    let question: String
    let options: [String]
    let correctIndex: Int
    let explanation: String
}

struct TutorMessage: Identifiable, Hashable {
    enum Role {
        case user
        case tutor
    }

    let id = UUID()
    let role: Role
    let text: String
}
