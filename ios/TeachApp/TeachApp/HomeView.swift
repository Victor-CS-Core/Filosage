import SwiftUI

struct HomeView: View {
    let store: SampleCourseStore
    @Environment(AppRouter.self) private var router
    @State private var topic = ""

    private let suggestions = [
        "Quantum Physics",
        "Machine Learning",
        "Music Theory",
        "Linear Algebra",
        "Plant Biology",
        "Roman History"
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.title)
                        .foregroundStyle(.blue)
                        .frame(width: 56, height: 56)
                        .background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))

                    Text("What do you want to learn?")
                        .font(.largeTitle.bold())

                    Text("Enter any topic, skill, or subject. Teach builds a focused course with lessons, checkpoints, and a tutor prompt.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 10) {
                    TextField("New topic", text: $topic)
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.go)
                        .onSubmit(startCourse)

                    Button(action: startCourse) {
                        Label("Start", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Try a topic")
                        .font(.headline)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                        ForEach(suggestions, id: \.self) { suggestion in
                            Button {
                                router.openCourse(store.course(matching: suggestion))
                            } label: {
                                Label(suggestion, systemImage: icon(for: suggestion))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("Discover Public Courses")
                        .font(.title2.bold())

                    ForEach(store.courses) { course in
                        Button {
                            router.openCourse(course)
                        } label: {
                            CourseCard(course: course)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(24)
        }
        .navigationTitle("Teach")
    }

    private func startCourse() {
        let trimmed = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        router.openCourse(store.course(matching: trimmed))
        topic = ""
    }

    private func icon(for topic: String) -> String {
        switch topic {
        case "Machine Learning": "brain.head.profile"
        case "Music Theory": "music.note"
        case "Linear Algebra": "function"
        case "Plant Biology": "leaf"
        case "Roman History": "building.columns"
        default: "atom"
        }
    }
}

private struct CourseCard: View {
    let course: Course

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(course.topic)
                    .font(.headline)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }

            Text(course.mission)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack(spacing: 14) {
                Label("\(course.modules.count) modules", systemImage: "square.stack.3d.up")
                Label("\(course.lessonCount) lessons", systemImage: "book")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(.quaternary)
        }
    }
}
