//! Windows kills the app-owned engine if the shell crashes. Handle never reaches JS.
use std::os::windows::io::RawHandle;
use windows_sys::Win32::{Foundation::{CloseHandle, HANDLE}, System::JobObjects::*};
pub struct Job(HANDLE);
unsafe impl Send for Job {}
unsafe impl Sync for Job {}
impl Job {
    pub fn attach(process: RawHandle) -> Result<Self, String> {
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() { return Err("Не удалось создать защиту дочернего процесса".into()); }
            let job = Self(handle);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(handle, JobObjectExtendedLimitInformation,
                &info as *const _ as *const _, std::mem::size_of_val(&info) as u32) == 0
                || AssignProcessToJobObject(handle, process as HANDLE) == 0 {
                return Err("Windows не разрешила безопасное управление Python".into());
            }
            Ok(job)
        }
    }
}
impl Drop for Job { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
