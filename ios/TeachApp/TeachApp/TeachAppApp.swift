import SwiftUI

@main
struct TeachAppApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var router = AppRouter()
    private let store = SampleCourseStore()

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
                .environment(router)
                .task {
                    consumePendingIntentTopic()
                }
                .onChange(of: scenePhase) {
                    if scenePhase == .active {
                        consumePendingIntentTopic()
                    }
                }
        }
    }

    @MainActor
    private func consumePendingIntentTopic() {
        let defaults = UserDefaults.standard
        guard let topic = defaults.string(forKey: "PendingTeachTopic") else { return }
        defaults.removeObject(forKey: "PendingTeachTopic")
        router.openCourse(store.course(matching: topic))
    }
}
