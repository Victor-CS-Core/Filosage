import SwiftUI

struct ContentView: View {
    let store: SampleCourseStore
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.path) {
            HomeView(store: store)
                .navigationDestination(for: AppRouter.Route.self) { route in
                    switch route {
                    case .course(let courseID):
                        CourseMapView(course: store.course(matching: courseID))
                    case .lesson(let courseID, let lessonID):
                        let course = store.course(matching: courseID)
                        if let lesson = course.modules.flatMap(\.lessons).first(where: { $0.id == lessonID }) {
                            LessonView(course: course, lesson: lesson)
                        } else {
                            ContentUnavailableView("Lesson unavailable", systemImage: "book.closed")
                        }
                    }
                }
        }
    }
}

#Preview {
    ContentView(store: SampleCourseStore())
        .environment(AppRouter())
}
