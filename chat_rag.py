import os
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_huggingface import HuggingFaceEndpoint
from langchain.chains import create_history_aware_retriever
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains import create_retrieval_chain
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.messages.ai import AIMessage
from langchain_core.messages.human import HumanMessage

# Langsmith
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_PROJECT"] = "cop-bot"
if not os.environ.get("LANGCHAIN_API_KEY"):
    os.environ["LANGCHAIN_API_KEY"] = "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"


# Embeddings, vector store & retriever
embedding = HuggingFaceEmbeddings(model_name="/home/saad/Documents/sentence-transformers/all-mpnet-base-v2")
persist_directory = 'chroma'
vectorstore = Chroma(
    persist_directory=persist_directory,
    embedding_function=embedding
)
retriever = vectorstore.as_retriever()


# LLM endpoint
endpoint_url = "http://localhost:8080"
llm = HuggingFaceEndpoint(
    endpoint_url=endpoint_url,
    max_new_tokens=128,
    top_k=10,
    top_p=0.95,
    typical_p=0.95,
    temperature=0.01,
    repetition_penalty=1.04,
)


# History aware retriver
contextualize_q_system_prompt = """
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a standalone question generator assistant. 

## instructions 
- Given a chat history and the latest user question which might reference context in the chat history, formulate a standalone question which can be understood without the chat history.
- Do NOT answer the question, just reformulate it if needed and otherwise return it as is.
- The response should only contain the new or old question without any note or explanation and do not answer the question.

Remember: You are just a standalone question generator. Never answer the question.
<|eot_id|>
"""
contextualize_q_user_input = """
<|begin_of_text|><|start_header_id|>user<|end_header_id|>
{input}
<|eot_id|>
<|start_header_id|>assistant<|end_header_id|>
"""
contextualize_q_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", contextualize_q_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", contextualize_q_user_input),
    ]
)
history_aware_retriever = create_history_aware_retriever(
    llm, retriever, contextualize_q_prompt
)


# RAG chain
system_prompt = """
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are an assistant for question-answering tasks. 
Use the following pieces of retrieved context to answer 
the question. If you don't know the answer, say that you 
don't know. Use three sentences maximum and keep the 
answer concise.
The response should only contain the answer
without any reference to text or context
or just say that you don't know.
\ncontext: ```{context}```
<|eot_id|>
"""
user_input = """
<|begin_of_text|><|start_header_id|>user<|end_header_id|>
{input}
<|eot_id|>
<|start_header_id|>assistant<|end_header_id|>
"""
qa_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", user_input),
    ]
)
question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)


# Chat history
store = {}
def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
    return store[session_id]
conversational_rag_chain = RunnableWithMessageHistory(
    rag_chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="chat_history",
    output_messages_key="answer",
)


def generate(input, session_id="abc123"):
    result = conversational_rag_chain.invoke(
        {"input": input},
        config={"configurable": {"session_id": session_id}},
    )
    user_msg = store['abc123'].messages[-2].content
    ai_msg = store['abc123'].messages[-1].content
    store['abc123'].messages[-2].content = f"<|begin_of_text|><|start_header_id|>user<|end_header_id|>{user_msg}<|eot_id|>"
    store['abc123'].messages[-1].content = f"<|begin_of_text|><|start_header_id|>assistant<|end_header_id|>{ai_msg}<|eot_id|>"
    return result
