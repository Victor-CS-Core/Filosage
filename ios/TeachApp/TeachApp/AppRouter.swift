import Foundation
import Observation

@MainActor
@Observable
final class AppRouter {
    var path: [Route] = []
    var selectedCourse: Course?

    enum Route: Hashable {
        case course(String)
        case lesson(courseID: String, lessonID: String)
    }

    func openCourse(_ course: Course) {
        selectedCourse = course
        path = [.course(course.id)]
    }

    func openLesson(_ lesson: Lesson, in course: Course) {
        selectedCourse = course
        path = [.course(course.id), .lesson(courseID: course.id, lessonID: lesson.id)]
    }
}
