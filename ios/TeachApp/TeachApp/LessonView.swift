import SwiftUI

struct LessonView: View {
    let course: Course
    let lesson: Lesson
    @State private var selectedAnswer: Int?
    @State private var isTutorOpen = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(course.topic)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    Text(lesson.title)
                        .font(.largeTitle.bold())

                    Text(lesson.concept)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                Text(lesson.reading)
                    .font(.body)

                VStack(alignment: .leading, spacing: 14) {
                    Label("Concept Visualization", systemImage: "point.3.connected.trianglepath.dotted")
                        .font(.headline)

                    ConceptFlowView()
                }

                VStack(alignment: .leading, spacing: 14) {
                    Label("Check Your Understanding", systemImage: "checkmark.seal")
                        .font(.headline)

                    QuizView(quiz: lesson.quiz, selectedAnswer: $selectedAnswer)
                }
            }
            .padding(24)
        }
        .navigationTitle(lesson.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button {
                isTutorOpen = true
            } label: {
                Label("Ask Tutor", systemImage: "bubble.left.and.bubble.right")
            }
        }
        .sheet(isPresented: $isTutorOpen) {
            TutorView(course: course, lesson: lesson)
        }
    }
}

private struct ConceptFlowView: View {
    var body: some View {
        HStack(spacing: 10) {
            FlowNode(title: "Example", icon: "doc.text")
            Image(systemName: "arrow.right")
                .foregroundStyle(.secondary)
            FlowNode(title: "Pattern", icon: "point.3.filled.connected.trianglepath.dotted")
            Image(systemName: "arrow.right")
                .foregroundStyle(.secondary)
            FlowNode(title: "Feedback", icon: "arrow.triangle.2.circlepath")
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct FlowNode: View {
    let title: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.blue)
            Text(title)
                .font(.caption.weight(.semibold))
        }
        .frame(maxWidth: .infinity)
    }
}

private struct QuizView: View {
    let quiz: Quiz
    @Binding var selectedAnswer: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(quiz.question)
                .font(.headline)

            ForEach(Array(quiz.options.enumerated()), id: \.offset) { index, option in
                Button {
                    selectedAnswer = index
                } label: {
                    HStack {
                        Text(String(UnicodeScalar(65 + index)!))
                            .font(.caption.weight(.bold))
                            .frame(width: 24, height: 24)
                            .background(.quaternary, in: Circle())

                        Text(option)
                            .multilineTextAlignment(.leading)

                        Spacer()

                        if let selectedAnswer {
                            Image(systemName: index == quiz.correctIndex ? "checkmark.circle.fill" : (selectedAnswer == index ? "xmark.circle.fill" : "circle"))
                                .foregroundStyle(index == quiz.correctIndex ? .green : (selectedAnswer == index ? .red : .secondary))
                        }
                    }
                }
                .buttonStyle(.bordered)
                .disabled(selectedAnswer != nil)
            }

            if selectedAnswer != nil {
                Text(quiz.explanation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(.quaternary)
        }
    }
}
