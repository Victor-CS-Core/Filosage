import Foundation

struct SampleCourseStore {
    let courses: [Course] = [
        Course(
            id: "machine-learning",
            topic: "Machine Learning",
            mission: "Build intuition for models, training loops, and evaluation so you can reason about practical AI systems.",
            modules: [
                CourseModule(
                    id: "foundations",
                    title: "Foundations",
                    lessons: [
                        Lesson(
                            id: "0-0",
                            title: "What Models Learn",
                            concept: "A model learns patterns by adjusting parameters to reduce error.",
                            reading: "Machine learning starts with examples. A model makes a prediction, compares it with the expected answer, and updates its internal parameters. Over many examples, the model becomes better at matching the patterns in the data.",
                            quiz: Quiz(
                                question: "What does training usually minimize?",
                                options: ["Network latency", "Prediction error", "Screen brightness", "File size"],
                                correctIndex: 1,
                                explanation: "Training changes parameters to reduce the gap between predictions and expected answers."
                            )
                        ),
                        Lesson(
                            id: "0-1",
                            title: "Features and Labels",
                            concept: "Features describe an example; labels describe the target answer.",
                            reading: "A feature is an input signal, such as a number, category, or measurement. A label is the answer a supervised model should learn to predict. Clear features and reliable labels make training far easier.",
                            quiz: Quiz(
                                question: "In a house price model, square footage is usually a...",
                                options: ["Feature", "Label", "Loss function", "Deployment target"],
                                correctIndex: 0,
                                explanation: "Square footage is an input signal used to predict the label, such as price."
                            )
                        )
                    ]
                ),
                CourseModule(
                    id: "practice",
                    title: "Practice",
                    lessons: [
                        Lesson(
                            id: "1-0",
                            title: "Avoiding Overfit",
                            concept: "A useful model performs well on new data, not just memorized examples.",
                            reading: "Overfit happens when a model matches the training set too closely and fails on new cases. Validation data, simpler models, regularization, and better data splits help reveal and reduce overfit.",
                            quiz: Quiz(
                                question: "Which signal best reveals overfit?",
                                options: ["Great validation results", "Poor validation results after strong training results", "A small app icon", "A short dataset filename"],
                                correctIndex: 1,
                                explanation: "A gap between training and validation performance is a classic overfit warning."
                            )
                        )
                    ]
                )
            ]
        ),
        Course(
            id: "music-theory",
            topic: "Music Theory",
            mission: "Learn the grammar behind melody, harmony, rhythm, and song structure.",
            modules: [
                CourseModule(
                    id: "harmony",
                    title: "Harmony",
                    lessons: [
                        Lesson(
                            id: "0-0",
                            title: "Intervals",
                            concept: "Intervals name the distance between two pitches.",
                            reading: "Intervals are the building blocks of melody and harmony. When you can hear and name distances like thirds, fifths, and octaves, chords and scales become easier to understand.",
                            quiz: Quiz(
                                question: "What does an interval measure?",
                                options: ["Tempo", "Pitch distance", "Instrument size", "Song length"],
                                correctIndex: 1,
                                explanation: "Intervals describe the distance from one pitch to another."
                            )
                        )
                    ]
                )
            ]
        )
    ]

    func course(matching idOrTopic: String) -> Course {
        let normalized = idOrTopic.lowercased()
        return courses.first {
            $0.id == normalized || $0.topic.lowercased() == normalized
        } ?? generatedCourse(for: idOrTopic)
    }

    func generatedCourse(for topic: String) -> Course {
        let cleanTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayTopic = cleanTopic.isEmpty ? "New Topic" : cleanTopic
        let id = displayTopic.lowercased().replacingOccurrences(of: " ", with: "-")

        return Course(
            id: id,
            topic: displayTopic,
            mission: "A focused starter path for building confidence in \(displayTopic).",
            modules: [
                CourseModule(
                    id: "starter",
                    title: "Starter Path",
                    lessons: [
                        Lesson(
                            id: "0-0",
                            title: "Core Ideas",
                            concept: "Name the central ideas before going deeper.",
                            reading: "\(displayTopic) becomes easier when you separate vocabulary, mental models, and practice. Start by writing the three ideas that keep showing up, then connect each idea to an example you can explain simply.",
                            quiz: Quiz(
                                question: "What is a strong first step when learning a new topic?",
                                options: ["Memorize everything", "Identify core ideas", "Skip practice", "Avoid examples"],
                                correctIndex: 1,
                                explanation: "Core ideas give you handles for understanding the rest of the topic."
                            )
                        )
                    ]
                )
            ]
        )
    }
}
