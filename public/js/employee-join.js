    // Opened from an invite email (employee-join.html?code=RU-ABC234)?
    // Fill the code in for them.
    const invitedCode = new URLSearchParams(window.location.search).get('code');
    if (invitedCode) {
        document.getElementById('inviteCode').value = invitedCode;
    }

    document.getElementById('employeeJoinForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const messageBox = document.getElementById('messageBox');
        const submitBtn = document.getElementById('submitBtn');

        const first_name = document.getElementById('firstName').value.trim();
        const last_name = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const workplaceInviteCode = document.getElementById('inviteCode').value.trim();

        //Explicitly force user role to skip selections
        const role = 'employee';

        messageBox.className = 'alert-box hidden';

        if (password !== confirmPassword) {
            messageBox.textContent = 'Passwords do not match.';
            messageBox.className = 'alert-box alert-error';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    first_name,
                    last_name,
                    email,
                    password,
                    role,
                    workplaceInviteCode
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                messageBox.textContent = `Registration submitted! Status is: ${data.user.workplace_status.toUpperCase()}.`;
                messageBox.className = 'alert-box alert-success';
                document.getElementById('password').value = '';
                document.getElementById('confirmPassword').value = '';
            } else {
                messageBox.textContent = data.message || 'An error occurred during submission.';
                messageBox.className = 'alert-box alert-error';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Join Workplace';
            }

        } catch (err) {
            console.error('Error handling join network payload:', err);
            messageBox.textContent = 'Connection error. Please confirm your database status.';
            messageBox.className = 'alert-box alert-error';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Request';
        }
    });
