import SwiftUI

struct CourseMapView: View {
    let course: Course
    @Environment(AppRouter.self) private var router
    @State private var expandedModuleID: CourseModule.ID?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(course.mission)
                        .font(.body)
                        .foregroundStyle(.secondary)

                    HStack {
                        Label("\(course.modules.count) modules", systemImage: "square.stack.3d.up")
                        Label("\(course.lessonCount) lessons", systemImage: "book")
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            ForEach(course.modules) { module in
                Section {
                    DisclosureGroup(
                        isExpanded: Binding(
                            get: { expandedModuleID == module.id },
                            set: { expandedModuleID = $0 ? module.id : nil }
                        )
                    ) {
                        ForEach(module.lessons) { lesson in
                            Button {
                                router.openLesson(lesson, in: course)
                            } label: {
                                LessonRow(lesson: lesson)
                            }
                        }
                    } label: {
                        HStack {
                            Text(module.title)
                                .font(.headline)
                            Spacer()
                            Text("\(module.lessons.count)")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(course.topic)
        .onAppear {
            expandedModuleID = expandedModuleID ?? course.modules.first?.id
        }
    }
}

private struct LessonRow: View {
    let lesson: Lesson

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "play.circle")
                .foregroundStyle(.blue)

            VStack(alignment: .leading, spacing: 4) {
                Text(lesson.title)
                    .foregroundStyle(.primary)
                Text(lesson.concept)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }
}
