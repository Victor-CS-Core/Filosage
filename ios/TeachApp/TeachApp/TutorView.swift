import SwiftUI

struct TutorView: View {
    let course: Course
    let lesson: Lesson
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var messages: [TutorMessage]

    init(course: Course, lesson: Lesson) {
        self.course = course
        self.lesson = lesson
        _messages = State(initialValue: [
            TutorMessage(role: .tutor, text: "Ask me anything about \(lesson.title). I can restate the idea, quiz you, or give a simpler example.")
        ])
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(messages) { message in
                            MessageBubble(message: message)
                        }
                    }
                    .padding()
                }

                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Ask about the lesson", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)

                    Button(action: send) {
                        Image(systemName: "paperplane.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding()
                .background(.bar)
            }
            .navigationTitle("AI Tutor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button("Done") {
                    dismiss()
                }
            }
        }
    }

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        messages.append(TutorMessage(role: .user, text: trimmed))
        messages.append(TutorMessage(role: .tutor, text: "Try connecting your question to this core idea: \(lesson.concept) A good next step is to explain it with one concrete example from \(course.topic)."))
        draft = ""
    }
}

private struct MessageBubble: View {
    let message: TutorMessage

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 40)
            }

            Text(message.text)
                .font(.body)
                .padding(12)
                .background(message.role == .user ? Color.blue : Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(message.role == .user ? .white : .primary)

            if message.role == .tutor {
                Spacer(minLength: 40)
            }
        }
    }
}
